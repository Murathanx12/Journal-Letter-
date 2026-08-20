"use client";

import Image from "@tiptap/extension-image";
import {
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type ReactNodeViewProps,
} from "@tiptap/react";
import {
  AlignCenter,
  Check,
  Crop as CropIcon,
  ImageOff,
  Layers,
  RotateCcw,
  Trash2,
  WrapText,
} from "lucide-react";
import { useRef, useState } from "react";

import { cn } from "@/lib/utils/cn";

import {
  asCrop,
  asImageFlow,
  asImageWidth,
  croppedAspect,
  croppedImageStyle,
  imageFrameStyle,
  isCropped,
  DEFAULT_IMAGE_WIDTH,
  FULL_CROP,
  MAX_FLOATED_WIDTH,
  MAX_IMAGE_WIDTH,
  MIN_CROP,
  MIN_IMAGE_WIDTH,
  type Crop,
} from "./image-frame";

/**
 * A photograph written *into* the letter, where the caret is.
 *
 * This is the one that behaves the way everybody already expects a picture to
 * behave, because it is how every word processor does it: paste, and it lands in
 * the sentence you are writing, at a sensible size, pushing the text down. Drag
 * a corner to resize it. Ask the writing to run around it.
 *
 * It is deliberately a different thing from a `PlacedMedia` sticker. A sticker
 * is pinned to a *page* — a third of the way down page four, at an angle, cut
 * into a heart — and belongs to the scrapbook half of the product. This belongs
 * to the writing, moves with it, and reflows when the words above it change.
 *
 * Two attributes carry the weight:
 *
 *   `path`  — the durable storage key. The `src` alongside it is a signed URL
 *             that expires within the hour, so it is stripped before the
 *             document is saved and resolved again at render time. See
 *             `withImageUrls` in `lib/text/rich-text`.
 *
 *   `width` — a *fraction* of the column, never a pixel count. A page in this
 *             book is a different number of pixels on a phone, on a laptop and
 *             in a PDF; a picture stored as "60% of the column" is the same
 *             picture in all three. This is why the extension's own pixel-based
 *             resize handles are left switched off in favour of the ones below.
 */

/**
 * Taking a picture out of the writing and pinning it to the page, where it can
 * sit behind the text and be dragged anywhere.
 *
 * A callback rather than an editor command, because the page layout lives
 * entirely outside the document — see `PlacedMedia`.
 */
export type PinToPage = {
  path: string;
  attachmentId: string | null;
  alt: string;
  width: number;
  srcWidth: number | null;
  srcHeight: number | null;
  crop: Crop;
  layer: "behind" | "front";
};

/**
 * Raised by a picture asking to be pinned to the page.
 *
 * A DOM event rather than an extension option, because extension options are
 * read once when the editor is created and a callback written into them then is
 * frozen against whatever the layout was at that moment. An event bubbles out
 * of the editor to whoever is listening now.
 */
export const PIN_TO_PAGE_EVENT = "book-image:pin-to-page";

export const BookImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),

      path: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-path"),
        renderHTML: (attributes) =>
          attributes.path ? { "data-path": attributes.path } : {},
      },

      width: {
        default: DEFAULT_IMAGE_WIDTH,
        parseHTML: (element) => asImageWidth(element.getAttribute("data-width")),
        renderHTML: (attributes) => ({ "data-width": String(asImageWidth(attributes.width)) }),
      },

      flow: {
        default: "block",
        parseHTML: (element) => asImageFlow(element.getAttribute("data-flow")),
        renderHTML: (attributes) => ({ "data-flow": asImageFlow(attributes.flow) }),
      },

      /** Which part of the photograph is shown. See `asCrop`. */
      crop: {
        default: null,
        parseHTML: (element) => {
          try {
            return asCrop(JSON.parse(element.getAttribute("data-crop") ?? "null"));
          } catch {
            return null;
          }
        },
        renderHTML: (attributes) =>
          attributes.crop ? { "data-crop": JSON.stringify(asCrop(attributes.crop)) } : {},
      },

      /**
       * The photograph's own pixel size, recorded at upload.
       *
       * A cropped frame has to know what shape to be before the picture has
       * loaded, or every page jumps as the images arrive one by one.
       */
      srcWidth: {
        default: null,
        parseHTML: (element) => Number(element.getAttribute("data-src-width")) || null,
        renderHTML: (attributes) =>
          attributes.srcWidth ? { "data-src-width": String(attributes.srcWidth) } : {},
      },
      srcHeight: {
        default: null,
        parseHTML: (element) => Number(element.getAttribute("data-src-height")) || null,
        renderHTML: (attributes) =>
          attributes.srcHeight ? { "data-src-height": String(attributes.srcHeight) } : {},
      },

      /** The attachment row, so a picture can be moved onto the page and back. */
      attachmentId: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-attachment"),
        renderHTML: (attributes) =>
          attributes.attachmentId ? { "data-attachment": attributes.attachmentId } : {},
      },
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(BookImageView);
  },
});

function BookImageView({
  node,
  updateAttributes,
  deleteNode,
  selected,
  editor,
}: ReactNodeViewProps) {
  const wrapper = useRef<HTMLDivElement>(null);
  const [resizing, setResizing] = useState(false);
  const [cropping, setCropping] = useState(false);

  const src = typeof node.attrs.src === "string" ? node.attrs.src : "";
  const alt = typeof node.attrs.alt === "string" ? node.attrs.alt : "";
  const width = asImageWidth(node.attrs.width);
  const flow = asImageFlow(node.attrs.flow);
  const crop = asCrop(node.attrs.crop);
  const editable = editor.isEditable;

  /**
   * The photograph's own proportions.
   *
   * Recorded at upload where possible, and read off the loaded image otherwise
   * — an entry written before pictures carried their size still has to crop.
   */
  const [source, setSource] = useState<{ width: number; height: number } | null>(
    node.attrs.srcWidth && node.attrs.srcHeight
      ? { width: Number(node.attrs.srcWidth), height: Number(node.attrs.srcHeight) }
      : null,
  );

  /**
   * The column the picture is sitting in. Inside the book that is one page, and
   * it changes when the window does — so it is measured at the moment of the
   * drag rather than remembered.
   */
  function columnWidth(): number {
    const column = wrapper.current?.closest(".tiptap") ?? wrapper.current?.parentElement;
    return column instanceof HTMLElement && column.clientWidth > 0 ? column.clientWidth : 0;
  }

  /** Run a pointer drag to completion, reporting movement in pixels. */
  function drag(event: React.PointerEvent, onMove: (dx: number, dy: number) => void) {
    event.preventDefault();
    event.stopPropagation();

    const startX = event.clientX;
    const startY = event.clientY;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);

    const move = (next: PointerEvent) => onMove(next.clientX - startX, next.clientY - startY);
    const end = () => {
      setResizing(false);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
    };

    setResizing(true);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
  }

  function startResize(event: React.PointerEvent) {
    const available = columnWidth();
    if (available === 0) return;

    const startWidth = width;
    // Dragging the left handle of a right-floated picture grows it leftwards,
    // which is the direction the corner actually moves.
    const sign = flow === "right" ? -1 : 1;

    drag(event, (dx) => {
      updateAttributes({
        width: Math.min(
          MAX_IMAGE_WIDTH,
          Math.max(MIN_IMAGE_WIDTH, startWidth + (sign * dx) / available),
        ),
      });
    });
  }

  /**
   * Drag one corner of the crop.
   *
   * Movement is measured against the *whole* photograph, which is what is on
   * screen while cropping — so half a picture's width of drag is half of the
   * source, which is what the stored fractions mean.
   */
  function startCrop(event: React.PointerEvent, corner: "nw" | "ne" | "sw" | "se") {
    const frame = wrapper.current?.getBoundingClientRect();
    if (!frame || frame.width === 0 || frame.height === 0) return;

    const start = crop;

    drag(event, (dx, dy) => {
      const fx = dx / frame.width;
      const fy = dy / frame.height;

      let { x, y, w, h } = start;

      if (corner === "nw" || corner === "sw") {
        const nx = Math.min(start.x + start.w - MIN_CROP, Math.max(0, start.x + fx));
        w = start.x + start.w - nx;
        x = nx;
      } else {
        w = Math.min(1 - start.x, Math.max(MIN_CROP, start.w + fx));
      }

      if (corner === "nw" || corner === "ne") {
        const ny = Math.min(start.y + start.h - MIN_CROP, Math.max(0, start.y + fy));
        h = start.y + start.h - ny;
        y = ny;
      } else {
        h = Math.min(1 - start.y, Math.max(MIN_CROP, start.h + fy));
      }

      updateAttributes({ crop: { x, y, w, h } });
    });
  }

  function pinToPage(layer: "behind" | "front") {
    const path = typeof node.attrs.path === "string" ? node.attrs.path : null;
    if (!path) return;

    const detail: PinToPage = {
      path,
      attachmentId: typeof node.attrs.attachmentId === "string" ? node.attrs.attachmentId : null,
      alt,
      width,
      srcWidth: source?.width ?? null,
      srcHeight: source?.height ?? null,
      crop,
      layer,
    };

    // `dispatchEvent` answers false when a listener called `preventDefault` —
    // which here means "I have taken it". If nobody did, the picture stays
    // where it is; deleting it regardless would throw a photograph away
    // whenever the surface around the editor did not offer somewhere to put it.
    const taken = !wrapper.current?.dispatchEvent(
      new CustomEvent(PIN_TO_PAGE_EVENT, { detail, bubbles: true, cancelable: true }),
    );

    // It now lives on the page rather than in the sentence, so the node has to
    // go — otherwise the same photograph would be there twice.
    if (taken) deleteNode();
  }

  const cropped = isCropped(crop);
  const aspect = source ? croppedAspect(crop, source.width, source.height) : crop.w / crop.h;

  // While cropping the whole photograph is shown, so there is something to drag
  // the crop back out to. The rest of the time only the kept part is drawn.
  const showingWhole = cropping;

  return (
    <NodeViewWrapper
      ref={wrapper}
      as="figure"
      data-flow={flow}
      className={cn("book-image relative", (resizing || cropping) && "select-none")}
      style={{
        ...imageFrameStyle(width, flow),
        ...(cropped && !showingWhole
          ? { aspectRatio: String(aspect), overflow: "hidden", position: "relative" }
          : null),
      }}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={alt}
          draggable={false}
          onLoad={(event) => {
            const image = event.currentTarget;
            if (source || !image.naturalWidth) return;
            setSource({ width: image.naturalWidth, height: image.naturalHeight });
            // Remembered on the node so the reading view, which never gets to
            // measure anything, can size a cropped frame too.
            updateAttributes({ srcWidth: image.naturalWidth, srcHeight: image.naturalHeight });
          }}
          className={cn(
            "rounded-[4px]",
            selected &&
              editable &&
              !cropping &&
              "outline-2 outline-offset-2 outline-[var(--color-brand)]",
          )}
          style={
            showingWhole
              ? { display: "block", width: "100%", height: "auto" }
              : croppedImageStyle(crop)
          }
        />
      ) : (
        <span className="flex aspect-[4/3] w-full items-center justify-center gap-2 rounded-[4px] bg-surface-sunk text-xs text-ink-muted">
          <ImageOff className="h-4 w-4" aria-hidden="true" />
          This picture could not be loaded
        </span>
      )}

      {editable && cropping ? <CropOverlay crop={crop} onCorner={startCrop} /> : null}

      {editable && selected ? (
        <>
          {!cropping ? (
            /*
              Both bottom corners, so the handle is never the one that has just
              been floated off the edge of the column and out of easy reach.
            */
            <span
              role="slider"
              tabIndex={-1}
              aria-label="Resize picture"
              aria-valuenow={Math.round(width * 100)}
              aria-valuemin={Math.round(MIN_IMAGE_WIDTH * 100)}
              aria-valuemax={100}
              onPointerDown={startResize}
              style={{ touchAction: "none" }}
              className={cn(
                "absolute -bottom-1.5 z-20 h-4 w-4 rounded-full border-2 border-brand bg-paper",
                flow === "right" ? "-left-1.5 cursor-nesw-resize" : "-right-1.5 cursor-nwse-resize",
              )}
            />
          ) : null}

          {/*
            The controls sit *on* the picture, not above it. Floated above they
            covered the line that had just been typed — and there is nowhere
            outside the picture to put them that is not either somebody's
            writing or, at the top and bottom of a page, clipped away entirely
            by the book's own overflow.
          */}
          <span
            contentEditable={false}
            className="no-print absolute top-1.5 left-1/2 z-30 flex -translate-x-1/2 flex-wrap items-center justify-center gap-0.5 rounded-full border border-rule bg-surface/95 px-1 py-1 shadow-sm backdrop-blur-sm"
          >
            {cropping ? (
              <>
                <span className="px-1.5 text-[11px] text-ink-muted">Drag the corners</span>
                <ImageControl
                  label="Show the whole picture again"
                  onClick={() => updateAttributes({ crop: FULL_CROP })}
                >
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                </ImageControl>
                <ImageControl label="Done cropping" active onClick={() => setCropping(false)}>
                  <Check className="h-3.5 w-3.5" aria-hidden="true" />
                </ImageControl>
              </>
            ) : (
              <>
                <ImageControl
                  label="In the writing"
                  active={flow === "block"}
                  onClick={() => updateAttributes({ flow: "block" })}
                >
                  <AlignCenter className="h-3.5 w-3.5" aria-hidden="true" />
                </ImageControl>

                <ImageControl
                  label="Writing runs down the right"
                  active={flow === "left"}
                  onClick={() =>
                    updateAttributes({ flow: "left", width: Math.min(width, MAX_FLOATED_WIDTH) })
                  }
                >
                  <WrapText className="h-3.5 w-3.5 -scale-x-100" aria-hidden="true" />
                </ImageControl>

                <ImageControl
                  label="Writing runs down the left"
                  active={flow === "right"}
                  onClick={() =>
                    updateAttributes({ flow: "right", width: Math.min(width, MAX_FLOATED_WIDTH) })
                  }
                >
                  <WrapText className="h-3.5 w-3.5" aria-hidden="true" />
                </ImageControl>

                <span className="mx-0.5 h-4 w-px bg-rule" aria-hidden="true" />

                <ImageControl
                  label="Crop this picture"
                  active={cropped}
                  onClick={() => setCropping(true)}
                >
                  <CropIcon className="h-3.5 w-3.5" aria-hidden="true" />
                </ImageControl>

                <ImageControl
                  label="Put it behind the writing, on the page"
                  onClick={() => pinToPage("behind")}
                >
                  <Layers className="h-3.5 w-3.5" aria-hidden="true" />
                </ImageControl>

                <span className="px-1 text-[11px] tabular-nums text-ink-muted">
                  {Math.round(width * 100)}%
                </span>

                <span className="mx-0.5 h-4 w-px bg-rule" aria-hidden="true" />

                <ImageControl
                  label="Describe this picture"
                  onClick={() => describe(alt, updateAttributes)}
                >
                  <span className="px-0.5 text-[11px]">Alt</span>
                </ImageControl>

                <ImageControl label="Remove this picture" onClick={deleteNode}>
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                </ImageControl>
              </>
            )}
          </span>
        </>
      ) : null}
    </NodeViewWrapper>
  );
}

/**
 * The crop rectangle, drawn over the whole photograph.
 *
 * Everything outside the kept area is dimmed rather than hidden, so it stays
 * obvious that the rest of the picture is still there and can be brought back.
 */
function CropOverlay({
  crop,
  onCorner,
}: {
  crop: Crop;
  onCorner: (event: React.PointerEvent, corner: "nw" | "ne" | "sw" | "se") => void;
}) {
  const corners = [
    { id: "nw", className: "-top-1.5 -left-1.5 cursor-nwse-resize" },
    { id: "ne", className: "-top-1.5 -right-1.5 cursor-nesw-resize" },
    { id: "sw", className: "-bottom-1.5 -left-1.5 cursor-nesw-resize" },
    { id: "se", className: "-bottom-1.5 -right-1.5 cursor-nwse-resize" },
  ] as const;

  const left = crop.x * 100;
  const top = crop.y * 100;
  const right = (crop.x + crop.w) * 100;
  const bottom = (crop.y + crop.h) * 100;

  return (
    <span contentEditable={false} className="no-print absolute inset-0 z-20">
      {/* A hole cut in the shade, so the kept area is seen at full strength. */}
      <span
        aria-hidden="true"
        className="absolute inset-0 bg-ink/55"
        style={{
          clipPath: [
            "polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%, 0% 0%",
            `${left}% ${top}%`,
            `${left}% ${bottom}%`,
            `${right}% ${bottom}%`,
            `${right}% ${top}%`,
            `${left}% ${top}%)`,
          ].join(", "),
        }}
      />

      <span
        className="absolute border-2 border-paper"
        style={{
          left: `${left}%`,
          top: `${top}%`,
          width: `${crop.w * 100}%`,
          height: `${crop.h * 100}%`,
        }}
      >
        {corners.map((corner) => (
          <span
            key={corner.id}
            role="slider"
            tabIndex={-1}
            aria-label={`Crop corner ${corner.id}`}
            aria-valuenow={Math.round(crop.w * 100)}
            aria-valuemin={5}
            aria-valuemax={100}
            onPointerDown={(event) => onCorner(event, corner.id)}
            style={{ touchAction: "none" }}
            className={cn(
              "absolute h-4 w-4 rounded-full border-2 border-brand bg-paper",
              corner.className,
            )}
          />
        ))}
      </span>
    </span>
  );
}

function describe(current: string, updateAttributes: (attrs: Record<string, unknown>) => void) {
  const next = window.prompt("Describe this picture for anyone who cannot see it.", current);
  if (next !== null) updateAttributes({ alt: next.slice(0, 300) });
}

function ImageControl({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      // Without this the editor loses the node selection the moment the
      // control is pressed, and the toolbar disappears from under the pointer.
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className={cn(
        "inline-flex h-7 min-w-7 items-center justify-center rounded-full transition-colors",
        active ? "bg-ink text-paper" : "text-ink-muted hover:bg-surface-sunk hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}

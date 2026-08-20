"use client";

import { Check, Eraser, MousePointer2, Pen, Redo2, Trash2, Undo2 } from "lucide-react";
import { useCallback, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";

import { BookPages } from "@/components/book/book-pages";
import { EntryContent } from "@/components/book/entry-content";
import { DrawnElement } from "@/components/media/drawing-layer";
import { PageStickers } from "@/components/media/media-layer";
import { PAGE_HEIGHT } from "@/lib/design/pages";
import {
  DEFAULT_COLOUR,
  elementAt,
  elementFromStrokes,
  INK_PRESETS,
  isFarEnough,
  MAX_ELEMENT_WIDTH,
  MAX_NIB,
  MIN_ELEMENT_WIDTH,
  MIN_NIB,
  strokePath,
  type DrawingElement,
  type PageStroke,
  type StrokeLayer,
} from "@/lib/media/drawing";
import { splitByLayer, type PlacedMedia } from "@/lib/media/placement";
import type { RichTextDoc } from "@/lib/text/rich-text";
import { cn } from "@/lib/utils/cn";

/**
 * Drawing on the pages.
 *
 * Its own mode, for the same reason arranging photographs is: dragging a pen
 * across the page and selecting a sentence are the same gesture, so a pen that
 * is always live would make writing impossible and an editor that is always
 * live would make drawing impossible.
 *
 * There are three tools, and the difference between the first two is the whole
 * design:
 *
 *   Pen    — lays down ink. Everything drawn without leaving the pen becomes
 *            *one drawing*, finished by pressing Finish, by picking another
 *            tool, or by leaving this tab.
 *   Arrow  — picks a finished drawing up. From there it moves, resizes, turns,
 *            fades, goes behind or in front of the writing, and can be thrown
 *            away — exactly like a photograph.
 *   Rubber — removes a whole drawing. A drawing is an object now, and half an
 *            object is a mess in a book.
 *
 * The pages here are the real ones — the same component, the same height, the
 * same pagination — with the writing shown but inert underneath. So a circle
 * drawn round a sentence is round that sentence when the letter is read.
 *
 * Everything goes through Pointer Events with `touch-action: none`, which gives
 * a finger, a stylus, a trackpad and a mouse the same code path. Drawing on a
 * phone was the point; a pen tool that needs a mouse is a pen tool for nobody.
 */

/** The measured page box, taken from the pages themselves. See `PhotoArranger`. */
type PageBox = { left: number; top: number; width: number; height: number; pitch: number };

type Tool = "pen" | "select" | "eraser";

type Gesture =
  | { kind: "draw" }
  | { kind: "erase" }
  | { kind: "move" | "resize"; id: string; startX: number; startY: number; origin: DrawingElement };

export function DrawingCanvas({
  content,
  mediaUrls,
  items,
  elements,
  onChange,
  indentParagraphs,
}: {
  content: RichTextDoc;
  mediaUrls: Map<string, string>;
  items: PlacedMedia[];
  elements: DrawingElement[];
  onChange: (elements: DrawingElement[]) => void;
  indentParagraphs: boolean;
}) {
  const probeFirst = useRef<HTMLSpanElement>(null);
  const probeSecond = useRef<HTMLSpanElement>(null);

  const [tool, setTool] = useState<Tool>("pen");
  const [colour, setColour] = useState(DEFAULT_COLOUR);
  const [nib, setNib] = useState(INK_PRESETS[0]!.width);
  const [opacity, setOpacity] = useState(1);
  const [layer, setLayer] = useState<StrokeLayer>("front");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  /**
   * The drawing in progress: strokes still in *page* coordinates, because it
   * has no box of its own until it is finished. Held in state so it renders as
   * the hand moves, and never pushed through `onChange` until it is finished —
   * every point would otherwise be a save, and a squiggle two hundred of them.
   */
  const [wet, setWet] = useState<{ page: number; strokes: PageStroke[] } | null>(null);
  const gesture = useRef<Gesture | null>(null);

  /** Drawings removed, newest first, so a mistaken rub-out can be taken back. */
  const [undone, setUndone] = useState<DrawingElement[]>([]);

  const measure = useCallback((): PageBox | null => {
    const first = probeFirst.current?.getBoundingClientRect();
    const second = probeSecond.current?.getBoundingClientRect();
    if (!first || !second || first.width === 0) return null;
    return {
      left: first.left,
      top: first.top,
      width: first.width,
      height: first.height,
      // On a phone this is one page plus one gutter; on a laptop it is the same,
      // because pages sit side by side at a constant pitch either way.
      pitch: second.left - first.left,
    };
  }, []);

  /** Where a pointer is, as a page and a fraction of that page. */
  const locate = useCallback(
    (event: ReactPointerEvent): { page: number; x: number; y: number } | null => {
      const box = measure();
      if (!box || box.pitch <= 0) return null;

      const along = event.clientX - box.left;
      const page = Math.max(0, Math.floor(along / box.pitch));

      return {
        page,
        x: (along - page * box.pitch) / box.width,
        y: (event.clientY - box.top) / box.height,
      };
    },
    [measure],
  );

  const pageAspect = useCallback((): number => {
    const box = measure();
    return box && box.width > 0 ? box.height / box.width : 1.4;
  }, [measure]);

  /**
   * Turn what has just been drawn into a drawing.
   *
   * Called whenever the pen is put down for good — by Finish, by picking
   * another tool, or by leaving. Until this happens the ink is not yet a thing
   * that can be picked up, which is exactly the distinction the tools make
   * visible.
   */
  const finish = useCallback(
    (select = false) => {
      setWet((current) => {
        if (!current) return null;

        const element = elementFromStrokes(current.strokes, {
          id: crypto.randomUUID(),
          page: current.page,
          layer,
          pageAspect: pageAspect(),
        });

        if (element) {
          onChange([...elements, element]);
          setUndone([]);
          if (select) setSelectedId(element.id);
        }
        return null;
      });
    },
    [elements, layer, onChange, pageAspect],
  );

  function chooseTool(next: Tool) {
    if (next !== "pen") finish(next === "select");
    setTool(next);
    if (next === "pen") setSelectedId(null);
  }

  const erase = useCallback(
    (page: number, x: number, y: number) => {
      const hit = elementAt(
        elements.filter((element) => element.page === page),
        x,
        y,
        pageAspect(),
      );
      if (!hit) return;

      setUndone((current) => [hit, ...current]);
      onChange(elements.filter((element) => element.id !== hit.id));
      setSelectedId((current) => (current === hit.id ? null : current));
    },
    [elements, onChange, pageAspect],
  );

  const update = useCallback(
    (id: string, patch: Partial<DrawingElement>) => {
      onChange(elements.map((element) => (element.id === id ? { ...element, ...patch } : element)));
    },
    [elements, onChange],
  );

  function onPointerDown(event: ReactPointerEvent) {
    // A right-click or a second finger mid-stroke should not start anything.
    if (!event.isPrimary || event.button !== 0) return;

    const at = locate(event);
    if (!at) return;

    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);

    if (tool === "eraser") {
      event.preventDefault();
      gesture.current = { kind: "erase" };
      erase(at.page, at.x, at.y);
      return;
    }

    if (tool === "select") {
      const hit = elementAt(
        elements.filter((element) => element.page === at.page),
        at.x,
        at.y,
        pageAspect(),
      );
      setSelectedId(hit?.id ?? null);
      if (!hit) return;

      event.preventDefault();
      gesture.current = { kind: "move", id: hit.id, startX: at.x, startY: at.y, origin: hit };
      return;
    }

    event.preventDefault();
    setWet((current) => ({
      // A drawing belongs to the page it was begun on.
      page: current?.page ?? at.page,
      strokes: [
        ...(current?.strokes ?? []),
        { id: crypto.randomUUID(), colour, width: nib, opacity, points: [at.x, at.y] },
      ],
    }));
    gesture.current = { kind: "draw" };
  }

  function onPointerMove(event: ReactPointerEvent) {
    const active = gesture.current;
    if (!active) return;

    const at = locate(event);
    if (!at) return;

    if (active.kind === "erase") {
      erase(at.page, at.x, at.y);
      return;
    }

    if (active.kind === "move") {
      // Dragging across the fold moves the drawing onto the next page, exactly
      // as it does for a photograph.
      const pages = at.page - active.origin.page;
      update(active.id, {
        page: active.origin.page + pages,
        x: active.origin.x + (at.x - active.startX),
        y: active.origin.y + (at.y - active.startY),
      });
      return;
    }

    if (active.kind === "resize") {
      const dx = at.x - active.startX + (at.page - active.origin.page);
      update(active.id, {
        width: Math.min(MAX_ELEMENT_WIDTH, Math.max(MIN_ELEMENT_WIDTH, active.origin.width + dx)),
      });
      return;
    }

    setWet((current) => {
      if (!current) return current;
      const strokes = [...current.strokes];
      const last = strokes.at(-1);
      if (!last) return current;

      // A drawing belongs to the page it began on; without this, crossing the
      // fold would rewrite coordinates against the next page and the line would
      // jump back to the left margin mid-gesture.
      const x = at.x + (at.page - current.page);
      if (!isFarEnough(last.points, x, at.y)) return current;

      strokes[strokes.length - 1] = { ...last, points: [...last.points, x, at.y] };
      return { ...current, strokes };
    });
  }

  function onPointerUp() {
    gesture.current = null;
  }

  function startResize(event: ReactPointerEvent, element: DrawingElement) {
    event.preventDefault();
    event.stopPropagation();
    const at = locate(event);
    if (!at) return;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    gesture.current = {
      kind: "resize",
      id: element.id,
      startX: at.x,
      startY: at.y,
      origin: element,
    };
  }

  function undo() {
    if (wet) {
      // Still wet: the last thing that happened was a stroke, so take that back
      // rather than a drawing finished some time ago.
      setWet((current) =>
        current && current.strokes.length > 1
          ? { ...current, strokes: current.strokes.slice(0, -1) }
          : null,
      );
      return;
    }
    const last = elements.at(-1);
    if (!last) return;
    setUndone((current) => [last, ...current]);
    onChange(elements.slice(0, -1));
  }

  function redo() {
    const [next, ...rest] = undone;
    if (!next) return;
    setUndone(rest);
    onChange([...elements, next]);
  }

  function clearAll() {
    if (elements.length === 0 && !wet) return;
    if (!window.confirm("Rub out everything drawn on this entry?")) return;
    setUndone((current) => [...elements].reverse().concat(current));
    setWet(null);
    onChange([]);
  }

  const selected = elements.find((element) => element.id === selectedId) ?? null;
  const behind = elements.filter((element) => element.layer === "behind");
  const front = elements.filter((element) => element.layer === "front");
  const stickers = splitByLayer(items);
  const nothingDrawn = elements.length === 0 && !wet;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-card border border-rule bg-surface px-3 py-2.5">
        <div className="flex items-center gap-1">
          <ToolButton
            label="Pen"
            active={tool === "pen"}
            onClick={() => chooseTool("pen")}
            icon={<Pen className="h-4 w-4" aria-hidden="true" />}
          />
          <ToolButton
            label="Move and resize a drawing"
            active={tool === "select"}
            onClick={() => chooseTool("select")}
            icon={<MousePointer2 className="h-4 w-4" aria-hidden="true" />}
          />
          <ToolButton
            label="Rubber"
            active={tool === "eraser"}
            onClick={() => chooseTool("eraser")}
            icon={<Eraser className="h-4 w-4" aria-hidden="true" />}
          />
        </div>

        {tool === "pen" ? (
          <>
            {/*
              A colour wheel, not a fixed palette: "that exact green" is a
              reasonable thing to want. The swatches beside it are shortcuts —
              picking one sets a sensible nib and opacity too, which is the
              difference between a pen and a highlighter.
            */}
            <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Ink">
              <label
                title="Any colour"
                className="relative h-8 w-8 shrink-0 cursor-pointer overflow-hidden rounded-full border-2 border-rule"
                style={{ background: colour }}
              >
                <span className="sr-only">Pick any colour</span>
                <input
                  type="color"
                  value={colour}
                  onChange={(event) => setColour(event.target.value)}
                  // The native swatch is unstyleable, so it is stretched out of
                  // sight behind a circle showing the colour actually chosen.
                  className="absolute -inset-2 h-[calc(100%+1rem)] w-[calc(100%+1rem)] cursor-pointer opacity-0"
                />
              </label>

              {INK_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  title={preset.label}
                  aria-label={preset.label}
                  aria-pressed={colour === preset.colour}
                  onClick={() => {
                    setColour(preset.colour);
                    setNib(preset.width);
                    setOpacity(preset.opacity);
                  }}
                  className={cn(
                    "h-7 w-7 rounded-full border-2 transition-transform",
                    colour === preset.colour ? "scale-110 border-ink" : "border-rule",
                  )}
                  style={{ background: preset.colour, opacity: preset.opacity }}
                />
              ))}
            </div>

            <label className="flex items-center gap-2 text-xs text-ink-muted">
              Nib
              <input
                type="range"
                min={Math.round(MIN_NIB * 10000)}
                max={Math.round(MAX_NIB * 10000)}
                step={1}
                value={Math.round(nib * 10000)}
                onChange={(event) => setNib(Number(event.target.value) / 10000)}
                className="w-24 accent-[var(--color-brand)]"
                aria-label="Nib width"
              />
              {/* What the nib will actually put on the page, at its real size. */}
              <span
                aria-hidden="true"
                className="inline-block shrink-0 rounded-full"
                style={{
                  width: `${Math.max(2, nib * 240)}px`,
                  height: `${Math.max(2, nib * 240)}px`,
                  background: colour,
                  opacity,
                }}
              />
            </label>

            <label className="flex items-center gap-2 text-xs text-ink-muted">
              Fade
              <input
                type="range"
                min={5}
                max={100}
                value={Math.round(opacity * 100)}
                onChange={(event) => setOpacity(Number(event.target.value) / 100)}
                className="w-20 accent-[var(--color-brand)]"
                aria-label="Ink opacity"
              />
            </label>

            <select
              value={layer}
              onChange={(event) => setLayer(event.target.value as StrokeLayer)}
              className="rounded-md border border-rule bg-surface px-2 py-1 text-xs text-ink"
              aria-label="Where new drawings go"
            >
              <option value="front">Draw over the writing</option>
              <option value="behind">Draw under the writing</option>
            </select>

            {wet ? (
              <button
                type="button"
                onClick={() => finish(true)}
                className="inline-flex items-center gap-1.5 rounded-full bg-ink px-3 py-1.5 text-xs text-paper"
              >
                <Check className="h-3.5 w-3.5" aria-hidden="true" />
                Finish this drawing
              </button>
            ) : null}
          </>
        ) : null}

        {tool === "select" ? (
          selected ? (
            <SelectedControls
              element={selected}
              onPatch={(patch) => update(selected.id, patch)}
              onDelete={() => {
                setUndone((current) => [selected, ...current]);
                onChange(elements.filter((element) => element.id !== selected.id));
                setSelectedId(null);
              }}
            />
          ) : (
            <p className="text-xs text-ink-muted">Tap a drawing to pick it up.</p>
          )
        ) : null}

        <div className="ml-auto flex items-center gap-1">
          <ToolButton
            label="Undo"
            disabled={nothingDrawn}
            onClick={undo}
            icon={<Undo2 className="h-4 w-4" aria-hidden="true" />}
          />
          <ToolButton
            label="Redo"
            disabled={undone.length === 0}
            onClick={redo}
            icon={<Redo2 className="h-4 w-4" aria-hidden="true" />}
          />
          <ToolButton
            label="Rub out everything"
            disabled={nothingDrawn}
            onClick={clearAll}
            icon={<Trash2 className="h-4 w-4" aria-hidden="true" />}
          />
        </div>
      </div>

      <div
        className="touch-none select-none"
        style={{
          touchAction: "none",
          cursor: tool === "eraser" ? "cell" : tool === "select" ? "default" : "crosshair",
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <BookPages
          pageHeight={PAGE_HEIGHT}
          label="Pages, for drawing on"
          footer={
            <span>
              {elements.length} {elements.length === 1 ? "drawing" : "drawings"}
              {wet ? " · one in progress" : ""}
            </span>
          }
        >
          <div className="page-anchor">
            {/* The rulers: invisible, laid out by the same CSS as a sticker, so
                measuring them measures a page. */}
            <span ref={probeFirst} aria-hidden="true" style={probeStyle(0)} />
            <span ref={probeSecond} aria-hidden="true" style={probeStyle(1)} />
          </div>

          {/*
            Every anchor first, paint order by `z-index` alone. An anchor takes
            no height but still has a place in the column flow, and a drawing is
            positioned relative to its anchor — so one written after the writing
            would land on whichever page the writing ended on, taking every
            drawing on the entry with it. See `EntryMedia`.
          */}
          <PageStickers items={stickers.behind} urls={mediaUrls} className="z-0" />
          <ElementLayer
            elements={behind}
            selectedId={tool === "select" ? selectedId : null}
            onResize={startResize}
            className="z-[1]"
          />
          <PageStickers items={stickers.front} urls={mediaUrls} className="z-20" />
          <ElementLayer
            elements={front}
            selectedId={tool === "select" ? selectedId : null}
            onResize={startResize}
            className="z-30"
          />

          {/* The ink currently under the hand, not yet a drawing. */}
          {wet ? <WetInk page={wet.page} strokes={wet.strokes} /> : null}

          {/* The writing, shown for reference but inert in this mode. */}
          <div
            className="book-prose pointer-events-none relative z-10"
            data-indent={indentParagraphs ? "true" : "false"}
          >
            <EntryContent content={content} mediaUrls={mediaUrls} />
          </div>
        </BookPages>
      </div>

      <p className="text-xs text-ink-muted">
        Everything drawn without leaving the pen becomes one drawing. Switch to the arrow to pick it
        up, move it, resize it, or send it behind the writing.
      </p>
    </div>
  );
}

/** The finished drawings on one layer, with a box round the selected one. */
function ElementLayer({
  elements,
  selectedId,
  onResize,
  className,
}: {
  elements: readonly DrawingElement[];
  selectedId: string | null;
  onResize: (event: ReactPointerEvent, element: DrawingElement) => void;
  className?: string;
}) {
  if (elements.length === 0) return null;

  return (
    <div className={cn("page-anchor pointer-events-none", className)} aria-hidden="true">
      {elements.map((element) => (
        <DrawnElement key={element.id} element={element} />
      ))}

      {elements
        .filter((element) => element.id === selectedId)
        .map((element) => (
          <span
            key={`${element.id}-box`}
            className="page-drawing"
            style={boxStyle(element)}
          >
            <span className="absolute -inset-1 rounded-sm border-2 border-brand" />
            <span
              role="slider"
              tabIndex={-1}
              aria-label="Resize drawing"
              aria-valuenow={Math.round(element.width * 100)}
              aria-valuemin={Math.round(MIN_ELEMENT_WIDTH * 100)}
              aria-valuemax={Math.round(MAX_ELEMENT_WIDTH * 100)}
              onPointerDown={(event) => onResize(event, element)}
              style={{ touchAction: "none" }}
              className="pointer-events-auto absolute -right-2.5 -bottom-2.5 h-5 w-5 cursor-nwse-resize rounded-full border-2 border-brand bg-paper"
            />
          </span>
        ))}
    </div>
  );
}

function boxStyle(element: DrawingElement): CSSProperties {
  return {
    "--page": element.page,
    "--x": element.x,
    "--y": element.y,
    "--w": element.width,
    "--ar": 1 / (element.aspect || 1),
  } as CSSProperties;
}

/**
 * Ink still under the hand.
 *
 * Drawn against the whole page, because until the pen is lifted for good the
 * drawing has no box of its own to be measured against.
 */
function WetInk({ page, strokes }: { page: number; strokes: readonly PageStroke[] }) {
  const [box, setBox] = useState({ width: 0, height: 0 });

  const observe = useCallback((svg: SVGSVGElement | null) => {
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    setBox({ width: rect.width, height: rect.height });
  }, []);

  return (
    <div className="page-anchor pointer-events-none z-40" aria-hidden="true">
      <svg
        ref={observe}
        className="page-drawing"
        style={
          {
            "--page": page,
            "--x": 0,
            "--y": 0,
            "--w": 1,
            aspectRatio: "auto",
            height: "var(--page-height)",
          } as CSSProperties
        }
        focusable="false"
      >
        {box.width > 0
          ? strokes.map((stroke) => (
              <path
                key={stroke.id}
                d={strokePath(stroke.points, box.width, box.height)}
                fill="none"
                stroke={stroke.colour}
                strokeWidth={stroke.width * box.width}
                strokeOpacity={stroke.opacity}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ))
          : null}
      </svg>
    </div>
  );
}

function SelectedControls({
  element,
  onPatch,
  onDelete,
}: {
  element: DrawingElement;
  onPatch: (patch: Partial<DrawingElement>) => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-ink-muted">
      <label className="flex items-center gap-2">
        Size
        <input
          type="range"
          min={Math.round(MIN_ELEMENT_WIDTH * 100)}
          max={Math.round(MAX_ELEMENT_WIDTH * 100)}
          value={Math.round(element.width * 100)}
          onChange={(event) => onPatch({ width: Number(event.target.value) / 100 })}
          className="w-20 accent-[var(--color-brand)]"
          aria-label="Drawing size"
        />
      </label>

      <label className="flex items-center gap-2">
        Angle
        <input
          type="range"
          min={-180}
          max={180}
          value={element.rotation}
          onChange={(event) => onPatch({ rotation: Number(event.target.value) })}
          className="w-20 accent-[var(--color-brand)]"
          aria-label="Drawing angle"
        />
      </label>

      <label className="flex items-center gap-2">
        Fade
        <input
          type="range"
          min={5}
          max={100}
          value={Math.round(element.opacity * 100)}
          onChange={(event) => onPatch({ opacity: Number(event.target.value) / 100 })}
          className="w-16 accent-[var(--color-brand)]"
          aria-label="Drawing opacity"
        />
      </label>

      <select
        value={element.layer}
        onChange={(event) => onPatch({ layer: event.target.value as StrokeLayer })}
        className="rounded-md border border-rule bg-surface px-2 py-1 text-xs text-ink"
        aria-label="Where this drawing sits"
      >
        <option value="front">Over the writing</option>
        <option value="behind">Behind the writing</option>
      </select>

      <button
        type="button"
        onClick={onDelete}
        aria-label="Delete this drawing"
        title="Delete this drawing"
        className="inline-flex h-7 w-7 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-surface-sunk hover:text-ink"
      >
        <Trash2 className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}

function ToolButton({
  label,
  active,
  disabled,
  onClick,
  icon,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  icon: ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex h-8 w-8 items-center justify-center rounded-full transition-colors",
        active ? "bg-ink text-paper" : "text-ink-muted hover:bg-surface-sunk hover:text-ink",
        "disabled:opacity-30 disabled:hover:bg-transparent",
      )}
    >
      {icon}
    </button>
  );
}

/** A full-page, zero-content marker. Identical in purpose to `PhotoArranger`'s. */
function probeStyle(page: number): CSSProperties {
  return {
    "--page": page,
    "--x": 0,
    "--y": 0,
    "--w": 1,
    visibility: "hidden",
    pointerEvents: "none",
    aspectRatio: "auto",
    height: "var(--page-height)",
    position: "absolute",
    left: "calc((100% + var(--page-gap, 0px)) * var(--page))",
    top: 0,
    width: "100%",
  } as CSSProperties;
}

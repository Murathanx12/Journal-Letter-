"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { EntryContent } from "@/components/book/entry-content";
import { getMask } from "@/lib/media/masks";
import { splitByLayer, type PlacedMedia } from "@/lib/media/placement";
import type { RichTextDoc } from "@/lib/text/rich-text";
import { cn } from "@/lib/utils/cn";

/**
 * Arranging photographs on a page.
 *
 * This is a separate mode from writing, deliberately. Dragging a picture and
 * selecting text are the same gesture, and putting drag handles on top of a
 * live text editor makes both worse. Here the writing is shown but inert, so a
 * drag always means "move the photo".
 *
 * All pointer handling goes through Pointer Events with `touch-action: none`,
 * which gives mouse, trackpad, pen and touch the same code path — arranging a
 * page on a phone was an explicit requirement, not an afterthought.
 */

type Interaction =
  | { kind: "move"; id: string; startX: number; startY: number; originX: number; originY: number }
  | {
      kind: "resize";
      id: string;
      startX: number;
      startY: number;
      originWidth: number;
      rotation: number;
    }
  | { kind: "rotate"; id: string; centreX: number; centreY: number; startAngle: number; originRotation: number };

const DEGREES = 180 / Math.PI;

export function PhotoArranger({
  content,
  items,
  urls,
  selectedId,
  onSelect,
  onChange,
  indentParagraphs,
}: {
  content: RichTextDoc;
  items: PlacedMedia[];
  urls: Map<string, string>;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onChange: (items: PlacedMedia[]) => void;
  indentParagraphs: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const interaction = useRef<Interaction | null>(null);
  const [dragging, setDragging] = useState(false);

  const { behind, front, wrapped } = splitByLayer(items);

  const update = useCallback(
    (id: string, patch: Partial<PlacedMedia>) => {
      onChange(items.map((item) => (item.id === id ? { ...item, ...patch } : item)));
    },
    [items, onChange],
  );

  const containerWidth = () => containerRef.current?.clientWidth ?? 1;

  function onPointerDown(
    event: React.PointerEvent,
    item: PlacedMedia,
    kind: "move" | "resize" | "rotate",
  ) {
    event.preventDefault();
    event.stopPropagation();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    onSelect(item.id);
    setDragging(true);

    if (kind === "move") {
      interaction.current = {
        kind,
        id: item.id,
        startX: event.clientX,
        startY: event.clientY,
        originX: item.x,
        originY: item.y,
      };
      return;
    }

    if (kind === "resize") {
      interaction.current = {
        kind,
        id: item.id,
        startX: event.clientX,
        startY: event.clientY,
        originWidth: item.width,
        rotation: item.rotation,
      };
      return;
    }

    // Rotation pivots on the picture's centre, so we need it in page coordinates.
    const box = (event.currentTarget as HTMLElement)
      .closest("[data-placed-item]")
      ?.getBoundingClientRect();
    const centreX = box ? box.left + box.width / 2 : event.clientX;
    const centreY = box ? box.top + box.height / 2 : event.clientY;

    interaction.current = {
      kind,
      id: item.id,
      centreX,
      centreY,
      startAngle: Math.atan2(event.clientY - centreY, event.clientX - centreX) * DEGREES,
      originRotation: item.rotation,
    };
  }

  function onPointerMove(event: React.PointerEvent) {
    const active = interaction.current;
    if (!active) return;

    const width = containerWidth();

    if (active.kind === "move") {
      // `left`/`top` are applied before the rotation transform and rotation is
      // about the centre, so a screen-space delta maps straight through.
      update(active.id, {
        x: active.originX + (event.clientX - active.startX) / width,
        y: active.originY + (event.clientY - active.startY) / width,
      });
      return;
    }

    if (active.kind === "resize") {
      // Project the drag onto the picture's own horizontal axis, so resizing a
      // rotated photo follows the corner you are actually holding.
      const radians = (active.rotation * Math.PI) / 180;
      const dx = event.clientX - active.startX;
      const dy = event.clientY - active.startY;
      const along = dx * Math.cos(radians) + dy * Math.sin(radians);

      update(active.id, {
        width: Math.min(1.6, Math.max(0.05, active.originWidth + along / width)),
      });
      return;
    }

    const angle =
      Math.atan2(event.clientY - active.centreY, event.clientX - active.centreX) * DEGREES;
    let rotation = active.originRotation + (angle - active.startAngle);

    // Snap to the straight angles, which is what people usually want.
    for (const snap of [-180, -135, -90, -45, 0, 45, 90, 135, 180]) {
      if (Math.abs(rotation - snap) < 4) rotation = snap;
    }

    update(active.id, { rotation: Math.round(rotation) });
  }

  function endInteraction() {
    interaction.current = null;
    setDragging(false);
  }

  // Arrow keys nudge the selected picture, so arranging does not require a
  // steady hand or a mouse at all.
  useEffect(() => {
    if (!selectedId) return;

    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;

      const item = items.find((candidate) => candidate.id === selectedId);
      if (!item) return;

      const step = event.shiftKey ? 0.05 : 0.005;
      const moves: Record<string, [number, number]> = {
        ArrowLeft: [-step, 0],
        ArrowRight: [step, 0],
        ArrowUp: [0, -step],
        ArrowDown: [0, step],
      };

      const move = moves[event.key];
      if (!move) return;

      event.preventDefault();
      update(item.id, { x: item.x + move[0], y: item.y + move[1] });
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedId, items, update]);

  function renderItem(item: PlacedMedia) {
    const url = urls.get(item.path);
    const selected = item.id === selectedId;
    const mask = getMask(item.mask);

    return (
      <div
        key={item.id}
        data-placed-item
        className="pointer-events-auto absolute"
        style={{
          left: `${item.x * 100}cqw`,
          top: `${item.y * 100}cqw`,
          width: `${item.width * 100}cqw`,
          height: `${item.width * item.aspect * 100}cqw`,
          transform: `rotate(${item.rotation}deg)`,
          touchAction: "none",
        }}
      >
        {/* The picture itself, clipped. Handles live outside this so the mask
            never cuts them off. */}
        <div
          role="button"
          tabIndex={0}
          aria-label={`Photograph${item.alt ? `: ${item.alt}` : ""}. Drag to move, arrow keys to nudge.`}
          onPointerDown={(event) => onPointerDown(event, item, "move")}
          onPointerMove={onPointerMove}
          onPointerUp={endInteraction}
          onPointerCancel={endInteraction}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onSelect(item.id);
            }
          }}
          className="h-full w-full cursor-move"
          style={{
            clipPath: mask.clipPath,
            opacity: item.opacity,
            transform: item.flipX ? "scaleX(-1)" : undefined,
          }}
        >
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={url}
              alt=""
              className="h-full w-full object-cover"
              draggable={false}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-surface-sunk text-xs text-ink-muted">
              Image unavailable
            </div>
          )}
        </div>

        {selected ? (
          <>
            <span
              aria-hidden="true"
              className="pointer-events-none absolute -inset-1 rounded-sm border-2 border-brand"
            />

            {/* Resize, bottom-right. */}
            <span
              role="slider"
              tabIndex={0}
              aria-label="Resize photograph"
              aria-valuenow={Math.round(item.width * 100)}
              aria-valuemin={5}
              aria-valuemax={160}
              onPointerDown={(event) => onPointerDown(event, item, "resize")}
              onPointerMove={onPointerMove}
              onPointerUp={endInteraction}
              onPointerCancel={endInteraction}
              className="absolute -right-2.5 -bottom-2.5 h-5 w-5 cursor-nwse-resize rounded-full border-2 border-brand bg-paper"
              style={{ touchAction: "none" }}
            />

            {/* Rotate, above the top edge. */}
            <span
              role="slider"
              tabIndex={0}
              aria-label="Rotate photograph"
              aria-valuenow={item.rotation}
              aria-valuemin={-180}
              aria-valuemax={180}
              onPointerDown={(event) => onPointerDown(event, item, "rotate")}
              onPointerMove={onPointerMove}
              onPointerUp={endInteraction}
              onPointerCancel={endInteraction}
              className="absolute -top-8 left-1/2 h-5 w-5 -translate-x-1/2 cursor-grab rounded-full border-2 border-brand bg-paper"
              style={{ touchAction: "none" }}
            />
            <span
              aria-hidden="true"
              className="pointer-events-none absolute -top-3 left-1/2 h-3 w-px -translate-x-1/2 bg-brand"
            />
          </>
        ) : null}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      onPointerDown={() => onSelect(null)}
      className={cn(
        "relative overflow-hidden rounded-card border border-rule bg-surface px-5 py-6 [container-type:inline-size] sm:px-8 sm:py-7",
        dragging && "select-none",
      )}
    >
      <div className="pointer-events-none absolute inset-0 z-0">{behind.map(renderItem)}</div>

      {/* The writing, shown for reference but inert in this mode. */}
      <div
        className="book-prose pointer-events-none relative z-10"
        data-indent={indentParagraphs ? "true" : "false"}
      >
        {wrapped.map((item) => {
          const url = urls.get(item.path);
          const mask = getMask(item.mask);
          return (
            <div
              key={item.id}
              className="pointer-events-auto"
              style={{
                float: item.side,
                width: `${item.width * 100}cqw`,
                height: `${item.width * item.aspect * 100}cqw`,
                shapeOutside: mask.shapeOutside === "none" ? undefined : mask.shapeOutside,
                shapeMargin: "0.9em",
                marginLeft: item.side === "right" ? "1.2em" : 0,
                marginRight: item.side === "left" ? "1.2em" : 0,
                marginBottom: "0.6em",
                transform: `rotate(${item.rotation}deg)`,
                clipPath: mask.clipPath,
                opacity: item.opacity,
                outline: item.id === selectedId ? "2px solid var(--color-brand)" : undefined,
              }}
              onPointerDown={(event) => {
                event.stopPropagation();
                onSelect(item.id);
              }}
            >
              {url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={url}
                  alt=""
                  className="h-full w-full object-cover"
                  style={{ transform: item.flipX ? "scaleX(-1)" : undefined }}
                  draggable={false}
                />
              ) : null}
            </div>
          );
        })}

        <EntryContent content={content} />
      </div>

      <div className="pointer-events-none absolute inset-0 z-20">{front.map(renderItem)}</div>
    </div>
  );
}

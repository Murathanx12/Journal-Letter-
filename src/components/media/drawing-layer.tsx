"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";

import { asColour, strokePath, type DrawingElement } from "@/lib/media/drawing";
import { cn } from "@/lib/utils/cn";

/**
 * Drawings, on the pages of the book.
 *
 * Each element is its own box, positioned by exactly the same arithmetic as a
 * photograph sticker: step across by one column plus one gutter per page, and
 * it lands on the page it was drawn on however wide that page turns out to be.
 * Inside that box the strokes are fractions of the box, so moving or resizing
 * the drawing needs no recalculation at all — the SVG simply gets a new size.
 *
 * It measures itself rather than working in a fixed `viewBox` with
 * `preserveAspectRatio="none"`. That would be less code and would be wrong: a
 * non-uniform scale stretches every stroke, and a drawn circle would come out
 * an ellipse. Measuring lets the path be built in real pixels, which keeps a
 * circle a circle and lets the nib width scale with the drawing.
 *
 * The same component draws what is saved and what is under somebody's finger,
 * so what you draw is exactly what is read back.
 */

/** One drawing, drawn at whatever size its box turned out to be. */
export function DrawnElement({
  element,
  className,
}: {
  element: DrawingElement;
  className?: string;
}) {
  const ref = useRef<SVGSVGElement>(null);
  const [box, setBox] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const svg = ref.current;
    if (!svg) return;

    // A resize changes how big a page is, and therefore the box — a drawing
    // that did not re-measure would drift the first time somebody turned their
    // phone sideways.
    const observer = new ResizeObserver(([entry]) => {
      const rect = entry?.contentRect;
      if (rect) setBox({ width: rect.width, height: rect.height });
    });

    observer.observe(svg);
    return () => observer.disconnect();
  }, []);

  return (
    <svg
      ref={ref}
      className={cn("page-drawing", className)}
      style={
        {
          "--page": element.page,
          "--x": element.x,
          "--y": element.y,
          "--w": element.width,
          "--ar": 1 / (element.aspect || 1),
          transform: element.rotation ? `rotate(${element.rotation}deg)` : undefined,
          opacity: element.opacity,
        } as CSSProperties
      }
      // Decorative: a drawing carries nothing the writing does not, and there is
      // no sensible text alternative for a squiggle.
      aria-hidden="true"
      focusable="false"
    >
      {box.width > 0
        ? element.strokes.map((stroke) => (
            <path
              key={stroke.id}
              d={strokePath(stroke.points, box.width, box.height)}
              fill="none"
              // Re-checked at the point of use, not only at the point of
              // parsing: this becomes an SVG attribute, and in a shared book it
              // was written by somebody else.
              stroke={asColour(stroke.colour)}
              strokeWidth={stroke.width * box.width}
              strokeOpacity={stroke.opacity}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))
        : null}
    </svg>
  );
}

export function DrawingLayer({
  elements,
  className,
}: {
  elements: readonly DrawingElement[];
  className?: string;
}) {
  if (elements.length === 0) return null;

  return (
    <div className={cn("page-anchor pointer-events-none", className)} aria-hidden="true">
      {elements.map((element) => (
        <DrawnElement key={element.id} element={element} />
      ))}
    </div>
  );
}

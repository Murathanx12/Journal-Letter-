import type { CSSProperties } from "react";

import { getMask } from "@/lib/media/masks";
import type { PlacedMedia } from "@/lib/media/placement";
import { cn } from "@/lib/utils/cn";

/**
 * Freely placed photographs.
 *
 * Positions are fractions of the column width, and are rendered with container
 * query units (`cqw`) so every coordinate — including the vertical one —
 * resolves against that width. A percentage `top` would resolve against the
 * container's *height*, which depends on how much has been written, so a page
 * arranged today would rearrange itself the moment somebody added a sentence.
 *
 * The layer never receives pointer events: the writing underneath has to stay
 * selectable even when a picture sits on top of it.
 */

export function placementStyle(item: PlacedMedia): CSSProperties {
  return {
    position: "absolute",
    left: `${item.x * 100}cqw`,
    top: `${item.y * 100}cqw`,
    width: `${item.width * 100}cqw`,
    height: `${item.width * item.aspect * 100}cqw`,
    transform: `rotate(${item.rotation}deg)${item.flipX ? " scaleX(-1)" : ""}`,
    opacity: item.opacity,
    clipPath: getMask(item.mask).clipPath,
  };
}

export function MediaLayer({
  items,
  urls,
  className,
}: {
  items: readonly PlacedMedia[];
  urls: Map<string, string>;
  className?: string;
}) {
  if (items.length === 0) return null;

  return (
    <div className={cn("pointer-events-none absolute inset-0", className)} aria-hidden={false}>
      {items.map((item) => {
        const url = urls.get(item.path);
        if (!url) return null;

        return (
          <div key={item.id} style={placementStyle(item)}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={url}
              alt={item.alt}
              className="h-full w-full object-cover"
              loading="lazy"
              draggable={false}
            />
          </div>
        );
      })}
    </div>
  );
}

/**
 * A photograph the writing flows around.
 *
 * This one has to sit *in* the text, not over it: `shape-outside` only affects
 * a float, and a float only exists in normal flow. The outline given to
 * `shape-outside` is the same shape the image is cut to, so the text hugs the
 * silhouette rather than a rectangle around it.
 *
 * `shape-outside` ignores rotation, so a rotated wrapped image gets a small
 * margin to keep its corners off the text.
 */
export function WrappedMedia({
  item,
  url,
  className,
}: {
  item: PlacedMedia;
  url: string | undefined;
  className?: string;
}) {
  if (!url) return null;

  const mask = getMask(item.mask);
  const rotated = item.rotation !== 0;

  return (
    <div
      className={cn("not-prose", className)}
      style={{
        float: item.side,
        width: `${item.width * 100}cqw`,
        height: `${item.width * item.aspect * 100}cqw`,
        shapeOutside: mask.shapeOutside === "none" ? undefined : mask.shapeOutside,
        shapeMargin: rotated ? "1.1em" : "0.9em",
        marginLeft: item.side === "right" ? "1.2em" : 0,
        marginRight: item.side === "left" ? "1.2em" : 0,
        marginBottom: "0.6em",
        opacity: item.opacity,
        transform: `rotate(${item.rotation}deg)${item.flipX ? " scaleX(-1)" : ""}`,
        clipPath: mask.clipPath,
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt={item.alt}
        className="h-full w-full object-cover"
        loading="lazy"
        draggable={false}
      />
    </div>
  );
}

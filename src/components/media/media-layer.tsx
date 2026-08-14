import type { CSSProperties } from "react";

import { getMask } from "@/lib/media/masks";
import type { PlacedMedia } from "@/lib/media/placement";
import { splitByLayer } from "@/lib/media/placement";
import { cn } from "@/lib/utils/cn";

/**
 * Photographs stuck onto the pages of a book.
 *
 * Every coordinate is a fraction handed to CSS as a custom property, and
 * `.page-sticker` turns those fractions into a position. Nothing measures
 * anything: because the stickers live inside the same column flow as the
 * writing, `--page` simply steps across by one column plus one gutter, so
 * "page four of this letter" lands on page four whatever size the page turns
 * out to be — and turning the page carries the photographs with it.
 */

export function stickerStyle(item: PlacedMedia): CSSProperties {
  return {
    "--page": item.page,
    "--x": item.x,
    "--y": item.y,
    "--w": item.width,
    // Width ÷ height. `aspect` is stored the other way up, as height ÷ width.
    "--ar": 1 / (item.aspect || 1),
    transform: `rotate(${item.rotation}deg)${item.flipX ? " scaleX(-1)" : ""}`,
    opacity: item.opacity,
    clipPath: getMask(item.mask).clipPath,
  } as CSSProperties;
}

/**
 * The anchor every sticker on an entry is positioned from.
 *
 * It takes no space and sits at the very start of the entry, which — because
 * each entry begins on a fresh page — puts it exactly at the top-left corner of
 * the entry's first page.
 */
export function PageStickers({
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
    <div className={cn("page-anchor", className)} aria-hidden={false}>
      {items.map((item) => {
        const url = urls.get(item.path);
        if (!url) return null;

        return (
          <div key={item.id} className="page-sticker" style={stickerStyle(item)}>
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
 * `shape-outside` ignores rotation, so a rotated wrapped image gets a slightly
 * larger margin to keep its corners off the writing.
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
        // A percentage of the column, which is the page: no measuring needed.
        width: `${item.width * 100}%`,
        aspectRatio: 1 / (item.aspect || 1),
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

/**
 * Every photograph on one entry, in the right order relative to the writing.
 *
 * Wrapped pictures must come before the text so the paragraphs that follow flow
 * around them; the free-standing ones are absolutely positioned, so their place
 * in the markup only decides what covers what.
 */
export function EntryMedia({
  items,
  urls,
  children,
}: {
  items: readonly PlacedMedia[];
  urls: Map<string, string>;
  children: React.ReactNode;
}) {
  const { behind, front, wrapped } = splitByLayer(items);

  // The writing is given a stacking position of its own. Without it, *any*
  // positioned sticker would paint over the text, because positioned elements
  // always paint above unpositioned ones no matter what order they are in — so
  // "behind the writing" would silently mean "in front of it".
  return (
    <>
      <PageStickers items={behind} urls={urls} className="z-0" />
      <div className="relative z-10">
        {wrapped.map((item) => (
          <WrappedMedia key={item.id} item={item} url={urls.get(item.path)} />
        ))}
        {children}
      </div>
      <PageStickers items={front} urls={urls} className="z-20" />
    </>
  );
}

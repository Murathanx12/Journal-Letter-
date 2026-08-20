import type { CSSProperties } from "react";

export {
  asCrop,
  croppedAspect,
  croppedImageStyle,
  isCropped,
  FULL_CROP,
  MIN_CROP,
  type Crop,
} from "@/lib/media/crop";

/**
 * The geometry of a picture written into a letter.
 *
 * Shared, deliberately, by the editor and the reading view. If the two worked
 * these out separately then a photograph set to 40% and floated right while
 * writing would land somewhere else when read — and the whole point of writing
 * onto real pages is that what you arrange is what you get.
 *
 * `width` is a *fraction of the column*, never a pixel count. A page in this
 * book is a different number of pixels on a phone, on a laptop and in a PDF; a
 * picture stored as "60% of the column" is the same picture in all three.
 */

export type ImageFlow = "block" | "left" | "right";

export const MIN_IMAGE_WIDTH = 0.15;
export const MAX_IMAGE_WIDTH = 1;
export const DEFAULT_IMAGE_WIDTH = 0.6;

/** Floated pictures are capped: a 90% float leaves a one-word gutter. */
export const MAX_FLOATED_WIDTH = 0.5;

export function asImageFlow(value: unknown): ImageFlow {
  return value === "left" || value === "right" ? value : "block";
}

export function asImageWidth(value: unknown): number {
  const number = typeof value === "string" ? Number.parseFloat(value) : value;
  if (typeof number !== "number" || !Number.isFinite(number)) return DEFAULT_IMAGE_WIDTH;
  return Math.min(MAX_IMAGE_WIDTH, Math.max(MIN_IMAGE_WIDTH, number));
}

export function imageFrameStyle(width: number, flow: ImageFlow): CSSProperties {
  const fraction = asImageWidth(width);

  if (flow === "block") {
    return {
      width: `${fraction * 100}%`,
      marginInline: "auto",
      marginBlock: "1.2em",
    };
  }

  return {
    width: `${fraction * 100}%`,
    float: flow,
    marginLeft: flow === "right" ? "1.2em" : 0,
    marginRight: flow === "left" ? "1.2em" : 0,
    marginBlock: "0.3em",
  };
}

import type { CSSProperties } from "react";

// -----------------------------------------------------------------------------
// Cropping
//
// A crop is stored as fractions of the *source* image, never as pixels, for the
// same reason everything else here is: the same crop has to mean the same thing
// on a phone, on a laptop and in a printed copy.
//
// Nothing is ever thrown away. Cropping changes which part of the photograph is
// shown, not what was uploaded — so a crop can be widened again later, and the
// original file is still the original file. In a book meant to last decades
// that matters more than saving the bytes.
// -----------------------------------------------------------------------------

export type Crop = { x: number; y: number; w: number; h: number };

export const FULL_CROP: Crop = { x: 0, y: 0, w: 1, h: 1 };

/** The smallest crop worth having; below this the handles overlap each other. */
export const MIN_CROP = 0.05;

export function asCrop(value: unknown): Crop {
  if (!value || typeof value !== "object") return FULL_CROP;
  const raw = value as Record<string, unknown>;

  const clamp = (candidate: unknown, fallback: number) =>
    typeof candidate === "number" && Number.isFinite(candidate)
      ? Math.min(1, Math.max(0, candidate))
      : fallback;

  const x = clamp(raw.x, 0);
  const y = clamp(raw.y, 0);
  // A crop that runs off the edge of its own image would show blank space, so
  // the size is capped by what is actually left from the corner.
  const w = Math.min(1 - x, Math.max(MIN_CROP, clamp(raw.w, 1)));
  const h = Math.min(1 - y, Math.max(MIN_CROP, clamp(raw.h, 1)));

  return { x, y, w, h };
}

export function isCropped(crop: Crop): boolean {
  return crop.x > 0 || crop.y > 0 || crop.w < 1 || crop.h < 1;
}

/**
 * The shape of the visible part, as width ÷ height.
 *
 * Needed because a cropped frame can no longer let the image size itself: the
 * frame has to be told what shape to be *before* the picture loads, or the page
 * jumps as each photograph arrives.
 */
export function croppedAspect(crop: Crop, sourceWidth: number, sourceHeight: number): number {
  if (sourceWidth <= 0 || sourceHeight <= 0) return crop.w / crop.h;
  return (crop.w * sourceWidth) / (crop.h * sourceHeight);
}

/**
 * How the picture is positioned inside its frame to show only the crop.
 *
 * The frame clips; the image is enlarged by 1/w and 1/h and slid back by the
 * crop's own offset. Because the frame is given the crop's aspect ratio, the
 * enlarged image lands undistorted.
 */
export function croppedImageStyle(crop: Crop): CSSProperties {
  if (!isCropped(crop)) return { display: "block", width: "100%", height: "auto" };

  return {
    position: "absolute",
    width: `${(1 / crop.w) * 100}%`,
    height: `${(1 / crop.h) * 100}%`,
    left: `${(-crop.x / crop.w) * 100}%`,
    top: `${(-crop.y / crop.h) * 100}%`,
    maxWidth: "none",
    display: "block",
  };
}

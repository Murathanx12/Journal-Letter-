/**
 * Cut-out shapes for photographs.
 *
 * Each mask carries the same geometry twice:
 *
 *   `clipPath`     — what the image is cut to.
 *   `shapeOutside` — the outline text flows around when the image is floated.
 *
 * They must describe the same shape, otherwise text would hug an outline that
 * does not match what the reader can see. Everything is expressed in
 * percentages so a shape scales with the image rather than being pinned to a
 * pixel size — which is also why these are CSS shapes rather than an SVG
 * `clip-path: url(...)`: `shape-outside` does not accept a URL reference, and
 * having one source of truth matters more than having a fancier curve.
 */

export type MaskId =
  | "none"
  | "rounded"
  | "circle"
  | "oval"
  | "arch"
  | "diamond"
  | "hexagon"
  | "star"
  | "heart"
  | "blob";

export type MaskDefinition = {
  id: MaskId;
  label: string;
  clipPath: string;
  shapeOutside: string;
};

const POLYGONS: Record<string, string> = {
  diamond: "polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)",
  hexagon: "polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)",
  star:
    "polygon(50% 0%, 61% 34%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 34%)",
  // A heart, approximated closely enough that the notch and point read clearly.
  heart:
    "polygon(50% 100%, 14% 66%, 3% 44%, 4% 26%, 15% 12%, 30% 9%, 43% 15%, 50% 26%, 57% 15%, 70% 9%, 85% 12%, 96% 26%, 97% 44%, 86% 66%)",
  // An organic torn-edge shape, the sort of thing you would cut out by hand.
  blob:
    "polygon(30% 2%, 62% 0%, 88% 13%, 100% 41%, 95% 70%, 75% 92%, 46% 100%, 20% 93%, 4% 72%, 0% 43%, 8% 17%)",
};

export const MASKS: Record<MaskId, MaskDefinition> = {
  none: { id: "none", label: "Square", clipPath: "none", shapeOutside: "none" },
  rounded: {
    id: "rounded",
    label: "Rounded",
    clipPath: "inset(0 round 14px)",
    shapeOutside: "inset(0 round 14px)",
  },
  circle: {
    id: "circle",
    label: "Circle",
    clipPath: "circle(50% at 50% 50%)",
    shapeOutside: "circle(50% at 50% 50%)",
  },
  oval: {
    id: "oval",
    label: "Oval",
    clipPath: "ellipse(50% 50% at 50% 50%)",
    shapeOutside: "ellipse(50% 50% at 50% 50%)",
  },
  arch: {
    id: "arch",
    label: "Arch",
    // A doorway: fully rounded across the top, square at the base.
    clipPath: "inset(0 round 50% 50% 0 0 / 45% 45% 0 0)",
    shapeOutside: "inset(0 round 50% 50% 0 0 / 45% 45% 0 0)",
  },
  diamond: {
    id: "diamond",
    label: "Diamond",
    clipPath: POLYGONS.diamond!,
    shapeOutside: POLYGONS.diamond!,
  },
  hexagon: {
    id: "hexagon",
    label: "Hexagon",
    clipPath: POLYGONS.hexagon!,
    shapeOutside: POLYGONS.hexagon!,
  },
  star: { id: "star", label: "Star", clipPath: POLYGONS.star!, shapeOutside: POLYGONS.star! },
  heart: { id: "heart", label: "Heart", clipPath: POLYGONS.heart!, shapeOutside: POLYGONS.heart! },
  blob: { id: "blob", label: "Cut-out", clipPath: POLYGONS.blob!, shapeOutside: POLYGONS.blob! },
};

export const MASK_IDS = Object.keys(MASKS) as MaskId[];

export function isMaskId(value: string): value is MaskId {
  return value in MASKS;
}

export function getMask(value: string | null | undefined): MaskDefinition {
  return value && isMaskId(value) ? MASKS[value] : MASKS.none;
}

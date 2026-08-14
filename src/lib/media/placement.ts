import { isMaskId, type MaskId } from "./masks";

/**
 * How a photograph is placed on a page.
 *
 * Two modes, because they answer different wishes and are built on different
 * CSS:
 *
 *   `free`  — the picture sits wherever you put it, either behind the writing
 *             or on top of it. Absolutely positioned, so text does not move.
 *   `wrap`  — the picture sits in the flow of the writing and the text runs
 *             around its outline. A float with `shape-outside`, which is the
 *             only way text can follow a cut-out shape.
 *
 * Positions are stored as fractions of the column width rather than pixels, so
 * a page arranged on a phone still looks right on a laptop and in an export.
 * The one exception is `y`, which is a fraction of the *width* too — using the
 * height would be meaningless, since an entry's height depends on how much has
 * been written.
 */

export type PlacementMode = "free" | "wrap";
export type PlacementLayer = "behind" | "front";

export type PlacedMedia = {
  /** Placement id, distinct from the attachment: one photo can appear twice. */
  id: string;
  attachmentId: string;
  /** Storage path, denormalised so rendering needs no join. */
  path: string;
  alt: string;

  mode: PlacementMode;

  /** `free` only. Fractions of the column width, from its top-left corner. */
  x: number;
  y: number;

  /** Width as a fraction of the column. Height follows from `aspect`. */
  width: number;
  /** Intrinsic height ÷ width, so the picture is never squashed. */
  aspect: number;

  rotation: number;
  mask: MaskId;
  layer: PlacementLayer;
  opacity: number;
  flipX: boolean;

  /** `wrap` only. Which side the text flows past. */
  side: "left" | "right";
};

export const DEFAULT_PLACEMENT: Omit<PlacedMedia, "id" | "attachmentId" | "path"> = {
  alt: "",
  mode: "free",
  x: 0.08,
  y: 0.06,
  width: 0.42,
  aspect: 1,
  rotation: 0,
  mask: "rounded",
  layer: "front",
  opacity: 1,
  flipX: false,
  side: "right",
};

function clamp(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : fallback;
}

/**
 * Read a layout out of jsonb.
 *
 * Anything unrecognised is dropped rather than rendered, and every number is
 * clamped to a sane range — a corrupt or hand-edited row should never be able
 * to push a photograph a mile off the page or hide the writing under a
 * full-opacity image nobody can select.
 */
export function parseLayout(value: unknown): PlacedMedia[] {
  if (!Array.isArray(value)) return [];

  const items: PlacedMedia[] = [];

  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Record<string, unknown>;

    if (typeof item.id !== "string" || typeof item.path !== "string") continue;
    if (typeof item.attachmentId !== "string") continue;

    items.push({
      id: item.id,
      attachmentId: item.attachmentId,
      path: item.path,
      alt: typeof item.alt === "string" ? item.alt.slice(0, 300) : "",
      mode: item.mode === "wrap" ? "wrap" : "free",
      // Allowed slightly outside the column so a picture can bleed off the edge.
      x: clamp(item.x, -0.5, 1.5, DEFAULT_PLACEMENT.x),
      y: clamp(item.y, -0.5, 20, DEFAULT_PLACEMENT.y),
      width: clamp(item.width, 0.05, 1.6, DEFAULT_PLACEMENT.width),
      aspect: clamp(item.aspect, 0.05, 20, 1),
      rotation: clamp(item.rotation, -180, 180, 0),
      mask: typeof item.mask === "string" && isMaskId(item.mask) ? item.mask : "none",
      layer: item.layer === "behind" ? "behind" : "front",
      opacity: clamp(item.opacity, 0.05, 1, 1),
      flipX: item.flipX === true,
      side: item.side === "left" ? "left" : "right",
    });
  }

  // A page with hundreds of images would be unusable and slow; this is a
  // scrapbook page, not an asset library.
  return items.slice(0, 40);
}

export function splitByLayer(items: readonly PlacedMedia[]) {
  return {
    behind: items.filter((item) => item.mode === "free" && item.layer === "behind"),
    front: items.filter((item) => item.mode === "free" && item.layer === "front"),
    wrapped: items.filter((item) => item.mode === "wrap"),
  };
}

/** Storage paths referenced by a layout, for batch-signing URLs. */
export function pathsInLayout(items: readonly PlacedMedia[]): string[] {
  return [...new Set(items.map((item) => item.path))];
}

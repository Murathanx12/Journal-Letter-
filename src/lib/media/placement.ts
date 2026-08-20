import { asCrop, FULL_CROP, type Crop } from "./crop";
import { isMaskId, type MaskId } from "./masks";

/**
 * How a photograph is stuck onto a page.
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
 * Everything is stored as a fraction rather than in pixels, so a page arranged
 * on a phone still looks right on a laptop and in an export.
 *
 * `y` being a fraction of the page *height* is only possible because the book
 * is paginated. In a continuously scrolling entry a page has no height — it
 * depends on how much has been written — so a photograph half way down would
 * move every time somebody added a sentence. A page in a book is a fixed
 * rectangle, so half way down means half way down.
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

  /** Which page of this entry it is stuck to. 0 is the page the entry opens on. */
  page: number;

  /** `free` only. Fractions of the page, from its top-left corner. */
  x: number;
  y: number;

  /** Width as a fraction of the page width. Height follows from `aspect`. */
  width: number;
  /**
   * Which part of the photograph is shown, as fractions of the source.
   *
   * Cropping never touches the uploaded file, so it can always be undone —
   * which matters in a book meant to outlast the decision.
   */
  crop: Crop;
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
  page: 0,
  x: 0.1,
  y: 0.08,
  width: 0.42,
  crop: FULL_CROP,
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
      page: Math.round(clamp(item.page, 0, 400, 0)),
      // Allowed slightly outside the page so a picture can bleed off the edge.
      x: clamp(item.x, -0.5, 1.5, DEFAULT_PLACEMENT.x),
      y: clamp(item.y, -0.5, 1.5, DEFAULT_PLACEMENT.y),
      width: clamp(item.width, 0.05, 1.6, DEFAULT_PLACEMENT.width),
      crop: asCrop(item.crop),
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

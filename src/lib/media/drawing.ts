/**
 * Drawing on the pages.
 *
 * A drawing is an *object*, not loose ink. You draw some strokes, and what you
 * end up with behaves like a photograph does: a thing with a box round it that
 * can be picked up, moved to another part of the page, made bigger or smaller,
 * turned, sent behind the writing, and thrown away — without touching the
 * strokes themselves.
 *
 * That is why there are two coordinate systems, and it is the only subtle thing
 * in this file:
 *
 *   * A `DrawingElement` is placed on a *page*, in fractions of that page —
 *     exactly like `PlacedMedia`. So a doodle a third of the way down page two
 *     is a third of the way down page two on a phone, on a laptop, and printed.
 *
 *   * A `Stroke` lives inside its element, in fractions of the *element's own
 *     box*. So making the element half as wide makes the drawing half as wide,
 *     line weight and all, and nothing has to be recalculated.
 *
 * Points are held in one flat array of numbers rather than a list of `{x, y}`
 * objects. A single unhurried stroke is a few hundred points, and `[0.31,0.22]`
 * is a third of the bytes of `{"x":0.31,"y":0.22}` — across a book of drawn-on
 * letters that is the difference between a column that stays small and one that
 * does not.
 *
 * `layer` is the whole answer to "does the writing stay on top?". `behind` puts
 * the drawing under the words, which is what you want for a circle around a
 * paragraph or a wash of colour; `front` puts it over them, which is what you
 * want for crossing something out or scribbling in a margin note.
 */

export type StrokeLayer = "behind" | "front";

export type Stroke = {
  id: string;
  /** Any colour, as `#rrggbb`. See `asColour`. */
  colour: string;
  /** Nib width as a fraction of the element's width, so it scales with it. */
  width: number;
  opacity: number;
  /** `[x0, y0, x1, y1, …]`, each a fraction of the element's box. */
  points: number[];
};

export type DrawingElement = {
  id: string;
  /** Which page of this entry it sits on. 0 is the entry's first page. */
  page: number;
  layer: StrokeLayer;
  /** Top-left corner, as fractions of the page. */
  x: number;
  y: number;
  /** Width as a fraction of the page width. Height follows from `aspect`. */
  width: number;
  /** Height ÷ width, so the drawing is never squashed. */
  aspect: number;
  rotation: number;
  opacity: number;
  strokes: Stroke[];
};

// -----------------------------------------------------------------------------
// Ink
//
// Any colour at all, because "I want that exact green" is a completely
// reasonable thing to want from a drawing tool — but only ever as `#rrggbb`.
//
// A stroke's colour goes straight into an SVG `stroke` attribute, and in a
// shared book that stroke was drawn by somebody else. Free text there would let
// a stored value reach into CSS: `url(...)`, a custom property, or an
// `image-set` that fetches something. Six hex digits cannot do any of that, and
// still says every colour a screen can show.
// -----------------------------------------------------------------------------

export const DEFAULT_COLOUR = "#23232b";

const HEX = /^#[0-9a-f]{6}$/i;

/** A drawable colour, or the default ink. Never anything CSS could act on. */
export function asColour(value: unknown): string {
  if (typeof value !== "string") return DEFAULT_COLOUR;

  const trimmed = value.trim().toLowerCase();
  if (HEX.test(trimmed)) return trimmed;

  // `#abc` is what an `<input type="color">` never produces but hand-written
  // JSON often does.
  if (/^#[0-9a-f]{3}$/.test(trimmed)) {
    return `#${trimmed[1]!.repeat(2)}${trimmed[2]!.repeat(2)}${trimmed[3]!.repeat(2)}`;
  }

  return DEFAULT_COLOUR;
}

/** Somewhere to start, and the quick picks beside the colour wheel. */
export type InkPreset = {
  label: string;
  colour: string;
  /** Nib width as a fraction of the *page*, which is how it is chosen. */
  width: number;
  opacity: number;
};

export const INK_PRESETS: InkPreset[] = [
  { label: "Ink", colour: DEFAULT_COLOUR, width: 0.004, opacity: 1 },
  { label: "Pencil", colour: "#7c7c86", width: 0.003, opacity: 0.85 },
  { label: "Red", colour: "#c0392b", width: 0.004, opacity: 1 },
  { label: "Blue", colour: "#2b5bc0", width: 0.004, opacity: 1 },
  { label: "Green", colour: "#2f7d4f", width: 0.004, opacity: 1 },
  { label: "Gold", colour: "#b08422", width: 0.004, opacity: 1 },
  { label: "Rose", colour: "#c2557d", width: 0.004, opacity: 1 },
  { label: "White", colour: "#fdfdfb", width: 0.006, opacity: 1 },
  { label: "Highlighter", colour: "#f2d94e", width: 0.028, opacity: 0.42 },
];

/**
 * Nib range, as a fraction of the page width.
 *
 * The bottom is a hairline at any page size; the top is a broad marker about a
 * seventh of the page across, which is wide enough to block in a background
 * wash without being wide enough to fill a page by accident.
 */
export const MIN_NIB = 0.0008;
export const MAX_NIB = 0.14;

/** Smallest a drawing can be shrunk to before its own handles cover it. */
export const MIN_ELEMENT_WIDTH = 0.04;
export const MAX_ELEMENT_WIDTH = 2;

// -----------------------------------------------------------------------------
// Reading a drawing out of jsonb
// -----------------------------------------------------------------------------

/**
 * Caps, so one entry cannot carry a drawing big enough to make the book slow to
 * open. Generous enough that nobody drawing by hand will meet them.
 */
const MAX_ELEMENTS = 60;
const MAX_STROKES_PER_ELEMENT = 400;
const MAX_POINTS_PER_STROKE = 1000;

function clamp(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : fallback;
}

function parsePoints(value: unknown): number[] {
  if (!Array.isArray(value)) return [];

  const points: number[] = [];
  // Pairs, so an odd-length array loses its dangling coordinate rather than
  // shifting every point after it by one.
  const usable = Math.min(value.length - (value.length % 2), MAX_POINTS_PER_STROKE * 2);

  for (let index = 0; index < usable; index += 1) {
    const number = value[index];
    if (typeof number !== "number" || !Number.isFinite(number)) {
      return points.slice(0, points.length - (points.length % 2));
    }
    // A little outside the box, so a stroke can overhang its own bounds, but
    // not so far that a corrupt row draws across the whole screen.
    points.push(Math.min(2, Math.max(-1, number)));
  }

  return points;
}

function parseStroke(raw: unknown, index: number): Stroke | null {
  if (!raw || typeof raw !== "object") return null;
  const item = raw as Record<string, unknown>;

  const points = parsePoints(item.points);
  // A stroke needs at least one point to be worth drawing; anything less is a
  // stray pointer-down that should not become a dot on somebody's letter.
  if (points.length < 2) return null;

  return {
    id: typeof item.id === "string" ? item.id : `s${index}`,
    colour: asColour(item.colour),
    width: clamp(item.width, 0.0005, 1, 0.01),
    opacity: clamp(item.opacity, 0.05, 1, 1),
    points,
  };
}

function parseElement(raw: unknown): DrawingElement | null {
  if (!raw || typeof raw !== "object") return null;
  const item = raw as Record<string, unknown>;
  if (typeof item.id !== "string") return null;
  if (!Array.isArray(item.strokes)) return null;

  const strokes = item.strokes
    .slice(0, MAX_STROKES_PER_ELEMENT)
    .map(parseStroke)
    .filter((stroke): stroke is Stroke => stroke !== null);

  if (strokes.length === 0) return null;

  return {
    id: item.id,
    page: Math.round(clamp(item.page, 0, 400, 0)),
    layer: item.layer === "front" ? "front" : "behind",
    // Allowed a little outside the page so a drawing can bleed off the edge.
    x: clamp(item.x, -0.5, 1.5, 0.1),
    y: clamp(item.y, -0.5, 1.5, 0.1),
    width: clamp(item.width, MIN_ELEMENT_WIDTH, MAX_ELEMENT_WIDTH, 0.4),
    aspect: clamp(item.aspect, 0.02, 50, 1),
    rotation: clamp(item.rotation, -180, 180, 0),
    opacity: clamp(item.opacity, 0.05, 1, 1),
    strokes,
  };
}

/**
 * Loose strokes from the first version of this feature, wrapped into elements.
 *
 * They were stored in page coordinates with no box of their own, so each page
 * and layer becomes one element covering the whole page — which draws exactly
 * what was drawn before, and can now be picked up like anything else.
 */
function upgradeLooseStrokes(value: readonly unknown[]): DrawingElement[] {
  const groups = new Map<string, DrawingElement>();

  value.forEach((raw, index) => {
    if (!raw || typeof raw !== "object") return;
    const item = raw as Record<string, unknown>;
    if (typeof item.id !== "string" || !Array.isArray(item.points)) return;

    const page = Math.round(clamp(item.page, 0, 400, 0));
    const layer = item.layer === "front" ? "front" : "behind";
    const key = `${page}:${layer}`;

    const stroke = parseStroke(item, index);
    if (!stroke) return;

    const existing = groups.get(key);
    if (existing) {
      existing.strokes.push(stroke);
      return;
    }

    groups.set(key, {
      id: `legacy-${key}`,
      page,
      layer,
      x: 0,
      y: 0,
      width: 1,
      // The old strokes were fractions of a whole page, and a page is taller
      // than it is wide; this keeps them where they were drawn.
      aspect: 1.4,
      rotation: 0,
      opacity: 1,
      strokes: [stroke],
    });
  });

  return [...groups.values()];
}

export function parseDrawing(value: unknown): DrawingElement[] {
  if (!Array.isArray(value)) return [];

  // Loose strokes carry `points`; elements carry `strokes`. Telling them apart
  // means an entry drawn on before this change still opens with its drawing.
  const looksLoose = value.some(
    (raw) => raw && typeof raw === "object" && Array.isArray((raw as { points?: unknown }).points),
  );
  if (looksLoose) return upgradeLooseStrokes(value).slice(0, MAX_ELEMENTS);

  const elements: DrawingElement[] = [];
  for (const raw of value) {
    const element = parseElement(raw);
    if (element) elements.push(element);
    if (elements.length >= MAX_ELEMENTS) break;
  }

  return elements;
}

export function splitElementsByLayer(elements: readonly DrawingElement[]) {
  return {
    behind: elements.filter((element) => element.layer === "behind"),
    front: elements.filter((element) => element.layer === "front"),
  };
}

export function elementsOnPage(
  elements: readonly DrawingElement[],
  page: number,
): DrawingElement[] {
  return elements.filter((element) => element.page === page);
}

// -----------------------------------------------------------------------------
// Turning points into a path
// -----------------------------------------------------------------------------

/**
 * A smooth path through the recorded points.
 *
 * Joining them with straight lines gives a visibly faceted stroke, because a
 * pointer only reports a position every frame or so. Instead each segment is a
 * quadratic curve whose control point is the recorded point and whose ends are
 * the midpoints either side of it, which passes smoothly through the hand's
 * actual motion without any curve-fitting.
 *
 * @param scaleX Box width in px. @param scaleY Box height in px.
 */
export function strokePath(points: readonly number[], scaleX: number, scaleY: number): string {
  const count = Math.floor(points.length / 2);
  if (count === 0) return "";

  const x = (index: number) => points[index * 2]! * scaleX;
  const y = (index: number) => points[index * 2 + 1]! * scaleY;

  // A single point is a dot: a zero-length line, which a round linecap renders
  // as a circle. Without this, tapping the page draws nothing at all.
  if (count === 1) return `M ${x(0)} ${y(0)} L ${x(0)} ${y(0)}`;
  if (count === 2) return `M ${x(0)} ${y(0)} L ${x(1)} ${y(1)}`;

  let path = `M ${x(0)} ${y(0)}`;

  for (let index = 1; index < count - 1; index += 1) {
    const midX = (x(index) + x(index + 1)) / 2;
    const midY = (y(index) + y(index + 1)) / 2;
    path += ` Q ${x(index)} ${y(index)} ${midX} ${midY}`;
  }

  // Finish on the last recorded point rather than on a midpoint, so the stroke
  // ends where the pointer was lifted.
  path += ` L ${x(count - 1)} ${y(count - 1)}`;
  return path;
}

/**
 * Is this point far enough from the last one to be worth recording?
 *
 * A pointer reports every frame, which at a slow, careful speed means dozens of
 * near-identical points a second. Dropping the ones that add nothing keeps the
 * stored drawing small without any visible loss — the curve above passes
 * through what remains.
 */
export function isFarEnough(
  points: readonly number[],
  x: number,
  y: number,
  minimum = 0.003,
): boolean {
  if (points.length < 2) return true;
  const lastX = points[points.length - 2]!;
  const lastY = points[points.length - 1]!;
  return Math.hypot(x - lastX, y - lastY) >= minimum;
}

// -----------------------------------------------------------------------------
// Making an element out of what was just drawn
// -----------------------------------------------------------------------------

/** A stroke as it is being drawn: still in page coordinates. */
export type PageStroke = Omit<Stroke, "points"> & { points: number[] };

/**
 * Wrap freshly drawn strokes into an element.
 *
 * The box is the bounding box of the ink, grown by half the widest nib so a
 * thick stroke is not clipped by its own edge, and the points are re-expressed
 * as fractions of that box. From here on the drawing is a thing that can be
 * moved and resized, and the strokes never need touching again.
 *
 * @param pageAspect Page height ÷ page width, needed to turn a box measured in
 *   page fractions into an aspect ratio that means the same thing in pixels.
 */
export function elementFromStrokes(
  strokes: readonly PageStroke[],
  options: { id: string; page: number; layer: StrokeLayer; pageAspect: number },
): DrawingElement | null {
  const inked = strokes.filter((stroke) => stroke.points.length >= 2);
  if (inked.length === 0) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let widest = 0;

  for (const stroke of inked) {
    widest = Math.max(widest, stroke.width);
    for (let index = 0; index < stroke.points.length; index += 2) {
      const x = stroke.points[index]!;
      const y = stroke.points[index + 1]!;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }

  // Half a nib each side, so the ink sits inside its own box rather than on it.
  const padX = widest / 2;
  const padY = padX / options.pageAspect;

  const x = minX - padX;
  const y = minY - padY;
  // A perfectly straight line has no extent in one direction; give it enough to
  // be grabbable, or its box would be zero-sized and impossible to select.
  const boxWidth = Math.max(maxX - minX + padX * 2, MIN_ELEMENT_WIDTH);
  const boxHeight = Math.max(maxY - minY + padY * 2, MIN_ELEMENT_WIDTH / options.pageAspect);

  return {
    id: options.id,
    page: options.page,
    layer: options.layer,
    x,
    y,
    width: boxWidth,
    // In pixels the box is (boxWidth · pageW) by (boxHeight · pageH), so its
    // shape depends on the page's own proportions as well as the ink's.
    aspect: (boxHeight * options.pageAspect) / boxWidth,
    rotation: 0,
    opacity: 1,
    strokes: inked.map((stroke) => ({
      ...stroke,
      // Nib width was chosen against the page; inside the box it is relative to
      // the box, so that resizing the drawing thickens the line with it.
      width: stroke.width / boxWidth,
      points: stroke.points.map((value, index) =>
        index % 2 === 0 ? (value - x) / boxWidth : (value - y) / boxHeight,
      ),
    })),
  };
}

/** Is this point inside the element's box? Used to pick one up. */
export function elementAt(
  elements: readonly DrawingElement[],
  x: number,
  y: number,
  pageAspect: number,
): DrawingElement | null {
  // Last drawn is topmost, so it is the one a click should find first.
  for (let index = elements.length - 1; index >= 0; index -= 1) {
    const element = elements[index]!;
    const height = (element.width * element.aspect) / pageAspect;
    if (
      x >= element.x &&
      x <= element.x + element.width &&
      y >= element.y &&
      y <= element.y + height
    ) {
      return element;
    }
  }
  return null;
}

/** An element's height as a fraction of the page. */
export function elementHeight(element: DrawingElement, pageAspect: number): number {
  return (element.width * element.aspect) / pageAspect;
}

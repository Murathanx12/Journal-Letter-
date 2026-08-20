import { describe, expect, it } from "vitest";

import {
  DEFAULT_COLOUR,
  asColour,
  elementAt,
  elementFromStrokes,
  elementHeight,
  isFarEnough,
  parseDrawing,
  splitElementsByLayer,
  strokePath,
  elementsOnPage,
  type DrawingElement,
  type PageStroke,
  type Stroke,
} from "@/lib/media/drawing";

/**
 * Drawing on the pages.
 *
 * Two rules run through all of this.
 *
 * Everything is a fraction, never a pixel — an element against the page, and a
 * stroke against its element — so a drawing made on a phone is the same drawing
 * on a laptop and in a printed copy.
 *
 * And a drawing is an *object*: strokes are bundled into a box that can be
 * moved and resized, which is what lets one be picked up like a photograph.
 */

function stroke(overrides: Partial<Stroke> & { id: string }): Stroke {
  return {
    colour: DEFAULT_COLOUR,
    width: 0.01,
    opacity: 1,
    points: [0.1, 0.1, 0.9, 0.9],
    ...overrides,
  };
}

function element(overrides: Partial<DrawingElement> & { id: string }): DrawingElement {
  return {
    page: 0,
    layer: "front",
    x: 0.1,
    y: 0.1,
    width: 0.4,
    aspect: 1,
    rotation: 0,
    opacity: 1,
    strokes: [stroke({ id: "s1" })],
    ...overrides,
  };
}

describe("parseDrawing", () => {
  it("reads a well-formed drawing back unchanged", () => {
    const input = [element({ id: "a", page: 2, layer: "behind" })];
    expect(parseDrawing(input)).toEqual(input);
  });

  it("returns nothing for anything that is not a list", () => {
    expect(parseDrawing(null)).toEqual([]);
    expect(parseDrawing("scribble")).toEqual([]);
    expect(parseDrawing({ strokes: [] })).toEqual([]);
  });

  it("drops an element with no id and one with no ink", () => {
    const parsed = parseDrawing([
      { page: 0, strokes: [stroke({ id: "s" })] },
      element({ id: "empty", strokes: [] }),
      element({ id: "kept" }),
    ]);
    expect(parsed.map((item) => item.id)).toEqual(["kept"]);
  });

  it("keeps any real colour, because a drawing tool should offer every colour", () => {
    const parsed = parseDrawing([element({ id: "a", strokes: [stroke({ id: "s", colour: "#1E90FF" })] })]);
    expect(parsed[0]!.strokes[0]!.colour).toBe("#1e90ff");
  });

  it("refuses a colour that is not six hex digits", () => {
    // The value ends up in an SVG `stroke` attribute, and in a shared book it
    // was written by somebody else. Anything CSS could act on is rejected.
    for (const nasty of ["url(#evil)", "var(--x)", "red; behavior:url(x)", "image-set(a)", 42]) {
      const parsed = parseDrawing([
        element({ id: "a", strokes: [{ ...stroke({ id: "s" }), colour: nasty } as unknown as Stroke] }),
      ]);
      expect(parsed[0]!.strokes[0]!.colour).toBe(DEFAULT_COLOUR);
    }
  });

  it("clamps a box that would sit far off the page", () => {
    const parsed = parseDrawing([element({ id: "a", x: -40, y: 90 })]);
    expect(parsed[0]!.x).toBe(-0.5);
    expect(parsed[0]!.y).toBe(1.5);
  });

  it("clamps the size, so a corrupt row cannot swallow the page", () => {
    expect(parseDrawing([element({ id: "a", width: 500 })])[0]!.width).toBeLessThanOrEqual(2);
    expect(parseDrawing([element({ id: "b", width: -3 })])[0]!.width).toBeGreaterThan(0);
  });

  it("drops a dangling coordinate rather than shifting every point after it", () => {
    const parsed = parseDrawing([
      element({ id: "a", strokes: [stroke({ id: "s", points: [0.1, 0.2, 0.3] })] }),
    ]);
    expect(parsed[0]!.strokes[0]!.points).toEqual([0.1, 0.2]);
  });

  it("stops at a point that is not a number, keeping whole pairs", () => {
    const parsed = parseDrawing([
      element({
        id: "a",
        strokes: [{ ...stroke({ id: "s" }), points: [0.1, 0.2, "x", 0.4] } as unknown as Stroke],
      }),
    ]);
    expect(parsed[0]!.strokes[0]!.points).toEqual([0.1, 0.2]);
  });

  it("caps how much one entry can carry", () => {
    const many = Array.from({ length: 200 }, (_, index) => element({ id: `e${index}` }));
    expect(parseDrawing(many).length).toBeLessThanOrEqual(60);
  });

  it("defaults an unknown layer to behind, so a drawing never hides the writing", () => {
    const parsed = parseDrawing([{ ...element({ id: "a" }), layer: "over-everything" }]);
    expect(parsed[0]!.layer).toBe("behind");
  });

  it("upgrades loose strokes from the first version into elements", () => {
    // Those were stored per page with no box of their own. They must still
    // open, and must now be pickupable like anything else.
    const legacy = [
      { id: "old-1", page: 1, layer: "front", colour: "#c0392b", width: 0.004, opacity: 1, points: [0.2, 0.3, 0.4, 0.5] },
      { id: "old-2", page: 1, layer: "front", colour: "#c0392b", width: 0.004, opacity: 1, points: [0.6, 0.7, 0.8, 0.9] },
      { id: "old-3", page: 2, layer: "behind", colour: "#2b5bc0", width: 0.004, opacity: 1, points: [0.1, 0.1, 0.2, 0.2] },
    ];

    const parsed = parseDrawing(legacy);
    expect(parsed).toHaveLength(2);
    // One element per page and layer, holding the strokes that were on it.
    expect(parsed[0]!.strokes).toHaveLength(2);
    expect(parsed[0]!.page).toBe(1);
    expect(parsed[1]!.page).toBe(2);
    expect(parsed[1]!.layer).toBe("behind");
  });
});

describe("asColour", () => {
  it("accepts any six-digit hex, in either case", () => {
    expect(asColour("#ABCDEF")).toBe("#abcdef");
    expect(asColour("#000000")).toBe("#000000");
  });

  it("expands the three-digit form", () => {
    expect(asColour("#f0a")).toBe("#ff00aa");
  });

  it("falls back to the default ink for anything else", () => {
    expect(asColour("rebeccapurple")).toBe(DEFAULT_COLOUR);
    expect(asColour("url(#evil)")).toBe(DEFAULT_COLOUR);
    expect(asColour(null)).toBe(DEFAULT_COLOUR);
    expect(asColour("#12345")).toBe(DEFAULT_COLOUR);
  });
});

describe("splitElementsByLayer and elementsOnPage", () => {
  const elements = [
    element({ id: "a", layer: "behind", page: 0 }),
    element({ id: "b", layer: "front", page: 0 }),
    element({ id: "c", layer: "front", page: 3 }),
  ];

  it("separates what goes under the writing from what goes over it", () => {
    const { behind, front } = splitElementsByLayer(elements);
    expect(behind.map((item) => item.id)).toEqual(["a"]);
    expect(front.map((item) => item.id)).toEqual(["b", "c"]);
  });

  it("finds the drawings belonging to one page", () => {
    expect(elementsOnPage(elements, 3).map((item) => item.id)).toEqual(["c"]);
    expect(elementsOnPage(elements, 9)).toEqual([]);
  });
});

describe("elementFromStrokes", () => {
  function wet(points: number[], width = 0.01): PageStroke {
    return { id: "s", colour: DEFAULT_COLOUR, width, opacity: 1, points };
  }

  const options = { id: "e1", page: 2, layer: "front" as const, pageAspect: 2 };

  it("returns nothing when no ink was laid down", () => {
    expect(elementFromStrokes([], options)).toBeNull();
    expect(elementFromStrokes([wet([])], options)).toBeNull();
  });

  it("wraps the ink in a box that surrounds it", () => {
    const made = elementFromStrokes([wet([0.2, 0.2, 0.6, 0.4])], options)!;
    // Half a nib of padding each side, so a thick stroke is not clipped by its
    // own edge. Horizontally that is width/2; vertically it is less, because a
    // page is taller than it is wide.
    expect(made.x).toBeCloseTo(0.2 - 0.005);
    expect(made.y).toBeCloseTo(0.2 - 0.0025);
    expect(made.width).toBeCloseTo(0.4 + 0.01);
  });

  it("keeps the page it was drawn on and the layer it was drawn into", () => {
    const made = elementFromStrokes([wet([0.2, 0.2, 0.6, 0.4])], options)!;
    expect(made.page).toBe(2);
    expect(made.layer).toBe("front");
  });

  it("re-expresses every point as a fraction of its own box", () => {
    const made = elementFromStrokes([wet([0.2, 0.2, 0.6, 0.4], 0)], options)!;
    const points = made.strokes[0]!.points;
    // The first point is the box's own top-left corner, the last its opposite.
    expect(points[0]).toBeCloseTo(0);
    expect(points[1]).toBeCloseTo(0);
    expect(points[2]).toBeCloseTo(1);
    expect(points[3]).toBeCloseTo(1);
  });

  it("re-expresses the nib against the box, so resizing thickens the line", () => {
    const made = elementFromStrokes([wet([0.2, 0.2, 0.6, 0.4], 0.02)], options)!;
    // Chosen as 0.02 of the page; the box is 0.42 of the page across.
    expect(made.strokes[0]!.width).toBeCloseTo(0.02 / made.width);
  });

  it("gives a perfectly straight line a box that can still be grabbed", () => {
    const made = elementFromStrokes([wet([0.2, 0.5, 0.8, 0.5], 0)], options)!;
    expect(made.width).toBeGreaterThan(0);
    expect(made.aspect).toBeGreaterThan(0);
  });
});

describe("elementAt", () => {
  // A square drawing: a page twice as tall as it is wide, and a box whose
  // height in page terms is therefore half its stated aspect.
  const drawing = element({ id: "a", x: 0.2, y: 0.2, width: 0.4, aspect: 1 });

  it("finds the drawing under the point", () => {
    expect(elementAt([drawing], 0.3, 0.25, 2)?.id).toBe("a");
  });

  it("finds nothing beside it", () => {
    expect(elementAt([drawing], 0.9, 0.9, 2)).toBeNull();
    expect(elementAt([drawing], 0.1, 0.25, 2)).toBeNull();
  });

  it("picks the topmost when drawings overlap", () => {
    const under = element({ id: "under", x: 0.2, y: 0.2, width: 0.4 });
    const over = element({ id: "over", x: 0.2, y: 0.2, width: 0.4 });
    expect(elementAt([under, over], 0.3, 0.25, 2)?.id).toBe("over");
  });
});

describe("elementHeight", () => {
  it("measures height against the page, not the box", () => {
    // A square box on a page twice as tall as wide covers half the width but
    // only a quarter of the height.
    expect(elementHeight(element({ id: "a", width: 0.5, aspect: 1 }), 2)).toBeCloseTo(0.25);
  });
});

describe("strokePath", () => {
  it("scales fractions by the measured box, so a box of any size works", () => {
    expect(strokePath([0.5, 0.25], 400, 800)).toBe("M 200 200 L 200 200");
  });

  it("draws a dot for a single point, so tapping the page leaves a mark", () => {
    expect(strokePath([0.5, 0.5], 100, 100)).toBe("M 50 50 L 50 50");
  });

  it("draws a straight line between two points", () => {
    expect(strokePath([0, 0, 1, 1], 100, 100)).toBe("M 0 0 L 100 100");
  });

  it("curves through the middle points and finishes on the last one", () => {
    const path = strokePath([0, 0, 0.5, 0.5, 1, 1], 100, 100);
    expect(path.startsWith("M 0 0")).toBe(true);
    expect(path).toContain("Q 50 50");
    expect(path.endsWith("L 100 100")).toBe(true);
  });

  it("returns nothing for no points", () => {
    expect(strokePath([], 100, 100)).toBe("");
  });
});

describe("isFarEnough", () => {
  it("accepts the very first point", () => {
    expect(isFarEnough([], 0.5, 0.5)).toBe(true);
  });

  it("rejects a point the hand has barely moved to", () => {
    expect(isFarEnough([0.5, 0.5], 0.5005, 0.5)).toBe(false);
  });

  it("accepts a point far enough to change the line", () => {
    expect(isFarEnough([0.5, 0.5], 0.55, 0.5)).toBe(true);
  });
});

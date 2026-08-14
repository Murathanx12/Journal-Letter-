import { describe, expect, it } from "vitest";

import { DEFAULT_PLACEMENT, parseLayout, pathsInLayout, splitByLayer } from "@/lib/media/placement";

/**
 * Where a photograph sits on a page.
 *
 * `layout` is a jsonb column, so what comes back is whatever is in the row —
 * possibly written by an older version of this application, possibly edited by
 * hand. Most of these tests are about that: a corrupt row must render as a
 * slightly odd page, never as a blank one or a photograph a mile off the paper.
 */

const valid = {
  id: "a",
  attachmentId: "att",
  path: "book/photo.jpg",
  alt: "the ferry at dusk",
  page: 2,
  x: 0.25,
  y: 0.4,
  width: 0.5,
  aspect: 0.75,
  rotation: 12,
  mask: "rounded",
  layer: "front",
  opacity: 0.9,
  flipX: true,
  side: "left",
  mode: "free",
};

describe("reading a layout", () => {
  it("keeps a good one intact", () => {
    expect(parseLayout([valid])).toEqual([valid]);
  });

  it("is empty for anything that is not a list", () => {
    for (const value of [null, undefined, {}, "[]", 7]) {
      expect(parseLayout(value)).toEqual([]);
    }
  });

  it("drops an item with no id, path or attachment", () => {
    expect(parseLayout([{ ...valid, id: undefined }])).toEqual([]);
    expect(parseLayout([{ ...valid, path: 7 }])).toEqual([]);
    expect(parseLayout([{ ...valid, attachmentId: null }])).toEqual([]);
  });

  it("pins a page to a whole number that exists", () => {
    expect(parseLayout([{ ...valid, page: -4 }])[0]!.page).toBe(0);
    expect(parseLayout([{ ...valid, page: 3.7 }])[0]!.page).toBe(4);
    expect(parseLayout([{ ...valid, page: 99999 }])[0]!.page).toBe(400);
    expect(parseLayout([{ ...valid, page: "two" }])[0]!.page).toBe(0);
  });

  it("keeps a photograph within reach of its page", () => {
    // A little outside is allowed, so a picture can bleed off the edge.
    expect(parseLayout([{ ...valid, x: 1.2 }])[0]!.x).toBe(1.2);
    expect(parseLayout([{ ...valid, x: 40 }])[0]!.x).toBe(1.5);
    expect(parseLayout([{ ...valid, y: -900 }])[0]!.y).toBe(-0.5);
  });

  it("refuses a size that would hide the writing entirely", () => {
    expect(parseLayout([{ ...valid, width: 12 }])[0]!.width).toBe(1.6);
    expect(parseLayout([{ ...valid, width: 0 }])[0]!.width).toBe(0.05);
  });

  it("keeps a photograph selectable by never letting it be fully opaque nothing", () => {
    expect(parseLayout([{ ...valid, opacity: 0 }])[0]!.opacity).toBe(0.05);
    expect(parseLayout([{ ...valid, opacity: 4 }])[0]!.opacity).toBe(1);
  });

  it("falls back on an unknown shape rather than dropping the photograph", () => {
    expect(parseLayout([{ ...valid, mask: "octagon" }])[0]!.mask).toBe("none");
  });

  it("caps a page that has been filled with hundreds of images", () => {
    const many = Array.from({ length: 90 }, (_, index) => ({ ...valid, id: `i${index}` }));
    expect(parseLayout(many)).toHaveLength(40);
  });

  it("trims an over-long description", () => {
    expect(parseLayout([{ ...valid, alt: "x".repeat(900) }])[0]!.alt).toHaveLength(300);
  });
});

describe("sorting by layer", () => {
  const items = parseLayout([
    { ...valid, id: "behind", layer: "behind", mode: "free" },
    { ...valid, id: "front", layer: "front", mode: "free" },
    { ...valid, id: "wrapped", mode: "wrap" },
    // A wrapped photograph flows in the text, so its layer means nothing.
    { ...valid, id: "wrapped-behind", mode: "wrap", layer: "behind" },
  ]);

  it("separates what the writing sits over from what sits over it", () => {
    const { behind, front, wrapped } = splitByLayer(items);
    expect(behind.map((item) => item.id)).toEqual(["behind"]);
    expect(front.map((item) => item.id)).toEqual(["front"]);
    expect(wrapped.map((item) => item.id)).toEqual(["wrapped", "wrapped-behind"]);
  });

  it("lists each storage path once, however often it is placed", () => {
    const twice = parseLayout([
      { ...valid, id: "a", path: "book/one.jpg" },
      { ...valid, id: "b", path: "book/one.jpg" },
      { ...valid, id: "c", path: "book/two.jpg" },
    ]);
    expect(pathsInLayout(twice)).toEqual(["book/one.jpg", "book/two.jpg"]);
  });
});

describe("a new photograph", () => {
  it("lands on the first page, in view", () => {
    expect(DEFAULT_PLACEMENT.page).toBe(0);
    expect(DEFAULT_PLACEMENT.x).toBeGreaterThan(0);
    expect(DEFAULT_PLACEMENT.x).toBeLessThan(1);
    expect(DEFAULT_PLACEMENT.y).toBeGreaterThan(0);
    // Comfortably on the page, not half off the bottom of it.
    expect(DEFAULT_PLACEMENT.y + DEFAULT_PLACEMENT.width).toBeLessThan(1);
  });
});

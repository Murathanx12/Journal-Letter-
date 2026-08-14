import { describe, expect, it } from "vitest";

import {
  compareWithinDay,
  groupEntriesByDay,
  isSealed,
  nextWithinDayOrder,
  reorderWithinDay,
  totalWords,
  type CompiledEntry,
} from "@/lib/entries/compile";

/**
 * The daily compilation rules, which are the heart of the product:
 * days in order, and within a day, whoever wrote first appears first.
 */

function entry(overrides: Partial<CompiledEntry> & { id: string }): CompiledEntry {
  return {
    authorId: "author-1",
    entryDate: "2026-08-14",
    withinDayOrder: 0,
    createdAt: "2026-08-14T08:00:00.000Z",
    title: null,
    content: { type: "doc" },
    plainText: "",
    layout: [],
    correctionState: "original",
    hasOriginal: false,
    tags: [],
    mood: null,
    location: null,
    sealedUntil: null,
    status: "published",
    ...overrides,
  };
}

describe("groupEntriesByDay", () => {
  it("puts whoever submitted first at the top of the day", () => {
    // Murathan writes at 07:00, Rossi at 09:00, but they arrive out of order.
    const rossi = entry({
      id: "rossi",
      authorId: "rossi",
      withinDayOrder: 1,
      createdAt: "2026-08-14T09:00:00.000Z",
    });
    const murathan = entry({
      id: "murathan",
      authorId: "murathan",
      withinDayOrder: 0,
      createdAt: "2026-08-14T07:00:00.000Z",
    });

    const [day] = groupEntriesByDay([rossi, murathan]);

    expect(day?.entries.map((item) => item.id)).toEqual(["murathan", "rossi"]);
  });

  it("falls back to creation time when the explicit order ties", () => {
    const later = entry({ id: "later", createdAt: "2026-08-14T10:00:00.000Z" });
    const earlier = entry({ id: "earlier", createdAt: "2026-08-14T06:00:00.000Z" });

    const [day] = groupEntriesByDay([later, earlier]);

    expect(day?.entries.map((item) => item.id)).toEqual(["earlier", "later"]);
  });

  it("is a stable sort when order and timestamp are identical", () => {
    const a = entry({ id: "aaa" });
    const b = entry({ id: "bbb" });

    expect(groupEntriesByDay([b, a])[0]?.entries.map((e) => e.id)).toEqual(["aaa", "bbb"]);
    expect(groupEntriesByDay([a, b])[0]?.entries.map((e) => e.id)).toEqual(["aaa", "bbb"]);
  });

  it("reads forwards like a book by default", () => {
    const days = groupEntriesByDay([
      entry({ id: "c", entryDate: "2026-08-16" }),
      entry({ id: "a", entryDate: "2026-08-14" }),
      entry({ id: "b", entryDate: "2026-08-15" }),
    ]);

    expect(days.map((day) => day.date)).toEqual(["2026-08-14", "2026-08-15", "2026-08-16"]);
  });

  it("can present the most recent day first for the book's home screen", () => {
    const days = groupEntriesByDay(
      [
        entry({ id: "a", entryDate: "2026-08-14" }),
        entry({ id: "b", entryDate: "2026-08-15" }),
      ],
      "desc",
    );

    expect(days.map((day) => day.date)).toEqual(["2026-08-15", "2026-08-14"]);
  });

  it("files a backdated import under its own date, not the date it was typed", () => {
    // Typed in August, but the letter belongs to June.
    const imported = entry({
      id: "imported",
      entryDate: "2026-06-20",
      createdAt: "2026-08-14T12:00:00.000Z",
    });
    const today = entry({ id: "today", entryDate: "2026-08-14" });

    const days = groupEntriesByDay([imported, today]);

    expect(days[0]?.date).toBe("2026-06-20");
    expect(days[0]?.entries[0]?.id).toBe("imported");
  });

  it("keeps several entries by the same person on one day", () => {
    const days = groupEntriesByDay([
      entry({ id: "morning", withinDayOrder: 0 }),
      entry({ id: "evening", withinDayOrder: 1 }),
    ]);

    expect(days).toHaveLength(1);
    expect(days[0]?.entries).toHaveLength(2);
  });

  it("returns nothing for no entries", () => {
    expect(groupEntriesByDay([])).toEqual([]);
  });
});

describe("compareWithinDay", () => {
  it("prefers the explicit order over the timestamp", () => {
    const first = entry({ id: "a", withinDayOrder: 0, createdAt: "2026-08-14T23:00:00.000Z" });
    const second = entry({ id: "b", withinDayOrder: 1, createdAt: "2026-08-14T01:00:00.000Z" });

    expect(compareWithinDay(first, second)).toBeLessThan(0);
  });
});

describe("nextWithinDayOrder", () => {
  it("appends rather than inserts, so the first writer stays first", () => {
    expect(nextWithinDayOrder([])).toBe(0);
    expect(nextWithinDayOrder([{ withinDayOrder: 0 }])).toBe(1);
    expect(nextWithinDayOrder([{ withinDayOrder: 0 }, { withinDayOrder: 4 }])).toBe(5);
  });
});

describe("reorderWithinDay", () => {
  const day = [
    entry({ id: "a", withinDayOrder: 0 }),
    entry({ id: "b", withinDayOrder: 1 }),
    entry({ id: "c", withinDayOrder: 2 }),
  ];

  it("moves an entry up and renumbers the whole day", () => {
    expect(reorderWithinDay(day, "c", "up")).toEqual([
      { id: "a", withinDayOrder: 0 },
      { id: "c", withinDayOrder: 1 },
      { id: "b", withinDayOrder: 2 },
    ]);
  });

  it("moves an entry down", () => {
    expect(reorderWithinDay(day, "a", "down")).toEqual([
      { id: "b", withinDayOrder: 0 },
      { id: "a", withinDayOrder: 1 },
      { id: "c", withinDayOrder: 2 },
    ]);
  });

  it("does nothing at the edges", () => {
    expect(reorderWithinDay(day, "a", "up")).toEqual([]);
    expect(reorderWithinDay(day, "c", "down")).toEqual([]);
  });

  it("does nothing for an unknown entry", () => {
    expect(reorderWithinDay(day, "missing", "up")).toEqual([]);
  });

  it("disambiguates a day where everything shares order 0, as after an import", () => {
    const imported = [
      entry({ id: "x", withinDayOrder: 0, createdAt: "2026-08-14T01:00:00.000Z" }),
      entry({ id: "y", withinDayOrder: 0, createdAt: "2026-08-14T02:00:00.000Z" }),
    ];

    expect(reorderWithinDay(imported, "y", "up")).toEqual([
      { id: "y", withinDayOrder: 0 },
      { id: "x", withinDayOrder: 1 },
    ]);
  });
});

describe("totalWords", () => {
  it("counts across entries and ignores stray whitespace", () => {
    expect(
      totalWords([
        entry({ id: "a", plainText: "  I love you sooo much askim  " }),
        entry({ id: "b", plainText: "good\nmorning" }),
      ]),
    ).toBe(8);
  });

  it("counts an empty entry as nothing", () => {
    expect(totalWords([entry({ id: "a", plainText: "   " })])).toBe(0);
  });
});

describe("isSealed", () => {
  it("stays sealed until the day it opens", () => {
    const sealed = entry({ id: "s", sealedUntil: "2030-01-01" });
    expect(isSealed(sealed, "2029-12-31")).toBe(true);
    expect(isSealed(sealed, "2030-01-01")).toBe(false);
    expect(isSealed(sealed, "2030-01-02")).toBe(false);
  });

  it("treats an ordinary entry as never sealed", () => {
    expect(isSealed(entry({ id: "n" }), "2026-08-14")).toBe(false);
  });
});

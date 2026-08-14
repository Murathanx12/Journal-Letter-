import { describe, expect, it } from "vitest";

import { toExportBlocks, plainTextOfBlocks } from "@/lib/export/document";
import {
  asRichTextDoc,
  countWords,
  EMPTY_DOC,
  excerpt,
  fromPlainText,
  isEmptyDoc,
  toPlainText,
  type RichTextDoc,
} from "@/lib/text/rich-text";

describe("toPlainText", () => {
  it("keeps paragraphs on separate lines", () => {
    const doc: RichTextDoc = {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Good morning." }] },
        { type: "paragraph", content: [{ type: "text", text: "I miss you." }] },
      ],
    };

    expect(toPlainText(doc)).toBe("Good morning.\nI miss you.");
  });

  it("joins marked runs without losing the words", () => {
    const doc: RichTextDoc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "I " },
            { type: "text", text: "really", marks: [{ type: "bold" }] },
            { type: "text", text: " mean it." },
          ],
        },
      ],
    };

    expect(toPlainText(doc)).toBe("I really mean it.");
  });

  it("turns a hard break into a newline", () => {
    const doc: RichTextDoc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "first" },
            { type: "hardBreak" },
            { type: "text", text: "second" },
          ],
        },
      ],
    };

    expect(toPlainText(doc)).toBe("first\nsecond");
  });

  it("flattens list items onto their own lines", () => {
    const doc: RichTextDoc = {
      type: "doc",
      content: [
        {
          type: "bulletList",
          content: [
            { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "tea" }] }] },
            { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "toast" }] }] },
          ],
        },
      ],
    };

    expect(toPlainText(doc)).toBe("tea\ntoast");
  });

  it("returns an empty string for an empty document", () => {
    expect(toPlainText(EMPTY_DOC)).toBe("");
    expect(toPlainText(null)).toBe("");
  });
});

describe("fromPlainText", () => {
  it("turns a pasted letter into real paragraphs", () => {
    const doc = fromPlainText("Good morning askim.\n\nI slept badly again.");

    expect(doc.content).toHaveLength(2);
    expect(toPlainText(doc)).toBe("Good morning askim.\nI slept badly again.");
  });

  it("preserves single newlines as hard breaks, not paragraph splits", () => {
    // Writing that used line breaks for rhythm should keep its shape.
    const doc = fromPlainText("roses are red\nviolets are blue");

    expect(doc.content).toHaveLength(1);
    expect(toPlainText(doc)).toBe("roses are red\nviolets are blue");
  });

  it("copes with Windows line endings", () => {
    expect(toPlainText(fromPlainText("one\r\n\r\ntwo"))).toBe("one\ntwo");
  });

  it("never produces an empty document", () => {
    expect(fromPlainText("").content).toEqual(EMPTY_DOC.content);
    expect(fromPlainText("   \n\n  ").content).toEqual(EMPTY_DOC.content);
  });

  it("round-trips through toPlainText", () => {
    const original = "First paragraph.\n\nSecond paragraph, with a\nline break in it.";
    expect(toPlainText(fromPlainText(original))).toBe(
      "First paragraph.\nSecond paragraph, with a\nline break in it.",
    );
  });
});

describe("asRichTextDoc", () => {
  it("degrades unrecognised data to an empty document rather than throwing", () => {
    // A malformed row must render blank, never crash a whole book.
    expect(asRichTextDoc(null)).toEqual(EMPTY_DOC);
    expect(asRichTextDoc("not a document")).toEqual(EMPTY_DOC);
    expect(asRichTextDoc({ type: "paragraph" })).toEqual(EMPTY_DOC);
    expect(asRichTextDoc(42)).toEqual(EMPTY_DOC);
  });

  it("passes a valid document through", () => {
    const doc = { type: "doc", content: [{ type: "paragraph" }] };
    expect(asRichTextDoc(doc).content).toHaveLength(1);
  });
});

describe("countWords and excerpt", () => {
  it("counts words", () => {
    expect(countWords("")).toBe(0);
    expect(countWords("   ")).toBe(0);
    expect(countWords("one")).toBe(1);
    expect(countWords("I love you sooo much askim")).toBe(6);
  });

  it("cuts an excerpt on a word boundary", () => {
    const long = "Victoria Harbour was grey that morning and the ferry was late as usual again";
    const short = excerpt(long, 30);
    const body = short.slice(0, -1);

    expect(short.endsWith("…")).toBe(true);
    expect(short.length).toBeLessThanOrEqual(31);
    // The kept text is a prefix of the original that stops at a space, so no
    // word is sliced in half.
    expect(long.startsWith(body)).toBe(true);
    expect(long[body.length]).toBe(" ");
  });

  it("leaves short text alone", () => {
    expect(excerpt("Short.", 100)).toBe("Short.");
  });
});

describe("isEmptyDoc", () => {
  it("recognises documents with no writing in them", () => {
    expect(isEmptyDoc(EMPTY_DOC)).toBe(true);
    expect(isEmptyDoc(fromPlainText("something"))).toBe(false);
  });
});

describe("toExportBlocks", () => {
  it("carries formatting through to the printable model", () => {
    const doc: RichTextDoc = {
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "A morning" }] },
        {
          type: "paragraph",
          content: [
            { type: "text", text: "I " },
            { type: "text", text: "really", marks: [{ type: "italic" }] },
            { type: "text", text: " mean it." },
          ],
        },
        { type: "blockquote", content: [{ type: "paragraph", content: [{ type: "text", text: "quoted" }] }] },
        {
          type: "bulletList",
          content: [
            { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "tea" }] }] },
          ],
        },
        { type: "horizontalRule" },
      ],
    };

    const blocks = toExportBlocks(doc);

    expect(blocks.map((block) => block.type)).toEqual([
      "heading",
      "paragraph",
      "quote",
      "listItem",
      "rule",
    ]);

    const paragraph = blocks[1];
    expect(paragraph?.type === "paragraph" && paragraph.runs[1]?.italic).toBe(true);
    expect(plainTextOfBlocks(blocks)).toContain("I really mean it.");
  });

  it("clamps heading levels into the range the exporters support", () => {
    const blocks = toExportBlocks({
      type: "doc",
      content: [{ type: "heading", attrs: { level: 9 }, content: [{ type: "text", text: "deep" }] }],
    });

    expect(blocks[0]?.type === "heading" && blocks[0].level).toBe(3);
  });

  it("trims trailing empty paragraphs so a printed page does not start blank", () => {
    const blocks = toExportBlocks({
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "words" }] },
        { type: "paragraph" },
        { type: "paragraph" },
      ],
    });

    expect(blocks).toHaveLength(1);
  });

  it("returns nothing for an empty document", () => {
    expect(toExportBlocks(EMPTY_DOC)).toEqual([]);
  });
});

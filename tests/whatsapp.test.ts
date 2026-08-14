import { describe, expect, it } from "vitest";

import { fromPlainText, type RichTextDoc } from "@/lib/text/rich-text";
import { toWhatsAppText } from "@/lib/text/whatsapp";

/**
 * Copying a letter to send it.
 *
 * WhatsApp is strict about its markup: a marker only applies when it touches
 * the text it wraps. Most of these tests exist to pin that down, because the
 * failure is silent — the letter arrives with asterisks in it instead of
 * emphasis, and nobody finds out until it has been sent.
 */

function doc(...content: RichTextDoc["content"] extends (infer T)[] | undefined ? T[] : never[]) {
  return { type: "doc" as const, content };
}

function para(...content: object[]) {
  return { type: "paragraph", content } as never;
}

function text(value: string, ...marks: string[]) {
  return marks.length > 0
    ? { type: "text", text: value, marks: marks.map((type) => ({ type })) }
    : { type: "text", text: value };
}

describe("marks", () => {
  it("uses WhatsApp's own markup", () => {
    expect(toWhatsAppText(doc(para(text("I love you", "bold"))))).toBe("*I love you*");
    expect(toWhatsAppText(doc(para(text("the ferry", "italic"))))).toBe("_the ferry_");
    expect(toWhatsAppText(doc(para(text("gone", "strike"))))).toBe("~gone~");
    expect(toWhatsAppText(doc(para(text("code", "code"))))).toBe("```code```");
  });

  it("keeps the markers flush against the words", () => {
    // "* bold *" is shown literally by WhatsApp; the spaces have to stay outside.
    expect(toWhatsAppText(doc(para(text("a "), text(" bold ", "bold"), text(" b"))))).toBe(
      "a  *bold*  b",
    );
  });

  it("combines marks", () => {
    expect(toWhatsAppText(doc(para(text("both", "bold", "italic"))))).toBe("_*both*_");
  });

  it("merges neighbouring runs that share a mark", () => {
    // Two text nodes, one emphasis: `*one**two*` would render as literal stars.
    expect(toWhatsAppText(doc(para(text("one ", "bold"), text("two", "bold"))))).toBe("*one two*");
  });

  it("leaves a mark it has no markup for alone", () => {
    expect(toWhatsAppText(doc(para(text("a link", "link"))))).toBe("a link");
    expect(toWhatsAppText(doc(para(text("underlined", "underline"))))).toBe("underlined");
  });

  it("does not wrap whitespace on its own", () => {
    expect(toWhatsAppText(doc(para(text("   ", "bold"))))).toBe("");
  });
});

describe("structure", () => {
  it("keeps paragraphs apart", () => {
    const source = fromPlainText("Good morning.\n\nI slept badly.");
    expect(toWhatsAppText(source)).toBe("Good morning.\n\nI slept badly.");
  });

  it("keeps the line breaks inside a paragraph", () => {
    const source = fromPlainText("the ferry does not wait\nand neither does the morning");
    expect(toWhatsAppText(source)).toBe("the ferry does not wait\nand neither does the morning");
  });

  it("bullets a list", () => {
    const list = {
      type: "bulletList",
      content: [
        { type: "listItem", content: [para(text("milk"))] },
        { type: "listItem", content: [para(text("bread"))] },
      ],
    } as never;

    expect(toWhatsAppText(doc(list))).toBe("• milk\n• bread");
  });

  it("numbers an ordered list", () => {
    const list = {
      type: "orderedList",
      content: [
        { type: "listItem", content: [para(text("first"))] },
        { type: "listItem", content: [para(text("second"))] },
      ],
    } as never;

    expect(toWhatsAppText(doc(list))).toBe("1. first\n2. second");
  });

  it("puts the title first, in bold", () => {
    expect(toWhatsAppText(doc(para(text("Body."))), "A poem")).toBe("*A poem*\n\nBody.");
  });

  it("is empty for an empty letter", () => {
    expect(toWhatsAppText(doc(para()))).toBe("");
    expect(toWhatsAppText(null)).toBe("");
  });
});

describe("other languages", () => {
  it("passes non-Latin text through untouched", () => {
    const source = fromPlainText("günaydın aşkım, seni çok seviyorum");
    expect(toWhatsAppText(source)).toBe("günaydın aşkım, seni çok seviyorum");
  });
});

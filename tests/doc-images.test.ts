import { describe, expect, it } from "vitest";

import {
  EMPTY_DOC,
  imagePathsInDoc,
  toPlainDoc,
  withImageUrls,
  withoutImageUrls,
  type RichTextDoc,
} from "@/lib/text/rich-text";

/**
 * Photographs written into a letter.
 *
 * The rule these enforce is a security one as much as a correctness one: an
 * image node carries a durable storage `path` and a signed `src` that stops
 * working within the hour. Only the path is ever stored. Persisting the URL
 * would mean an entry opened tomorrow showed broken pictures, and would leave a
 * working credential in a row every other member of the book can read.
 */

const SIGNED = "https://example.supabase.co/storage/v1/object/sign/book-media/x?token=abc";

function doc(...content: unknown[]): RichTextDoc {
  return { type: "doc", content: content as RichTextDoc["content"] };
}

function image(attrs: Record<string, unknown>) {
  return { type: "image", attrs };
}

const nested = doc(
  { type: "paragraph", content: [{ type: "text", text: "Before" }] },
  image({ path: "book/one.webp", src: SIGNED, width: 0.6, flow: "block" }),
  {
    type: "blockquote",
    content: [image({ path: "book/two.webp", src: SIGNED })],
  },
);

describe("toPlainDoc", () => {
  /**
   * ProseMirror builds every node's `attrs` with `Object.create(null)` and
   * `toJSON` hands that same object out. React's Server Action serializer will
   * not treat a null-prototype object as data — it sends an opaque temporary
   * reference instead, and the whole attribute is lost in transit. This is what
   * dropped a photograph's storage path, a paragraph's alignment and a poem's
   * typeface on every explicit save.
   */
  function proseMirrorish() {
    const attrs = Object.create(null);
    attrs.path = "book/one.webp";
    attrs.width = 0.6;
    return { type: "doc", content: [{ type: "image", attrs }] };
  }

  it("gives attributes an ordinary prototype", () => {
    const original = proseMirrorish();
    expect(Object.getPrototypeOf(original.content[0]!.attrs)).toBeNull();

    const plain = toPlainDoc(original);
    expect(Object.getPrototypeOf(plain.content![0]!.attrs)).toBe(Object.prototype);
  });

  it("keeps every value intact", () => {
    const plain = toPlainDoc(proseMirrorish());
    expect(plain.content![0]!.attrs).toEqual({ path: "book/one.webp", width: 0.6 });
  });

  it("copies rather than sharing, so later edits cannot reach through", () => {
    const original = proseMirrorish();
    const plain = toPlainDoc(original);
    original.content[0]!.attrs.path = "changed";
    expect(plain.content![0]!.attrs?.path).toBe("book/one.webp");
  });

  it("degrades anything that is not a document to a blank one", () => {
    // A blank page, never a crash: this runs on writing that came out of a
    // database column somebody else's editor wrote.
    expect(toPlainDoc(null)).toEqual(EMPTY_DOC);
    expect(toPlainDoc({ type: "not-a-doc" })).toEqual(EMPTY_DOC);
    expect(toPlainDoc("nonsense")).toEqual(EMPTY_DOC);
  });
});

describe("imagePathsInDoc", () => {
  it("finds pictures nested anywhere in the writing", () => {
    expect(imagePathsInDoc(nested).sort()).toEqual(["book/one.webp", "book/two.webp"]);
  });

  it("reports each path once, however often it is used", () => {
    const twice = doc(image({ path: "book/one.webp" }), image({ path: "book/one.webp" }));
    expect(imagePathsInDoc(twice)).toEqual(["book/one.webp"]);
  });

  it("ignores an image with no path, which cannot be signed anyway", () => {
    expect(imagePathsInDoc(doc(image({ src: SIGNED })))).toEqual([]);
  });

  it("copes with anything that is not a document", () => {
    expect(imagePathsInDoc(null)).toEqual([]);
    expect(imagePathsInDoc("hello")).toEqual([]);
  });
});

describe("withoutImageUrls", () => {
  it("strips the signed URL and keeps the path", () => {
    const stripped = withoutImageUrls(nested);
    const picture = stripped.content![1]!;

    expect(picture.attrs?.src).toBeNull();
    expect(picture.attrs?.path).toBe("book/one.webp");
  });

  it("strips pictures nested inside other blocks too", () => {
    const stripped = withoutImageUrls(nested);
    const quoted = stripped.content![2]!.content![0]!;
    expect(quoted.attrs?.src).toBeNull();
  });

  it("keeps everything a picture is arranged with", () => {
    const picture = withoutImageUrls(nested).content![1]!;
    expect(picture.attrs?.width).toBe(0.6);
    expect(picture.attrs?.flow).toBe("block");
  });

  it("leaves the writing alone", () => {
    const stripped = withoutImageUrls(nested);
    expect(stripped.content![0]).toEqual({
      type: "paragraph",
      content: [{ type: "text", text: "Before" }],
    });
  });

  it("does not touch a link, which is not a signed URL and must survive", () => {
    const linked = doc({
      type: "paragraph",
      content: [
        { type: "text", text: "here", marks: [{ type: "link", attrs: { href: SIGNED } }] },
      ],
    });
    expect(withoutImageUrls(linked)).toEqual(linked);
  });
});

describe("withImageUrls", () => {
  it("fills in the URL that matches each path", () => {
    const urls = new Map([["book/one.webp", SIGNED]]);
    const filled = withImageUrls(withoutImageUrls(nested), urls);
    expect(filled.content![1]!.attrs?.src).toBe(SIGNED);
  });

  it("accepts a plain object, which is what a server component passes down", () => {
    const filled = withImageUrls(nested, { "book/one.webp": SIGNED });
    expect(filled.content![1]!.attrs?.src).toBe(SIGNED);
  });

  it("leaves a picture with no URL unrenderable rather than broken", () => {
    // Signing fails when the file is gone or the reader is not allowed it. A
    // null `src` renders as nothing; a stale one renders as a broken image.
    const filled = withImageUrls(nested, new Map());
    expect(filled.content![1]!.attrs?.src).toBeNull();
  });

  it("survives a round trip through storage", () => {
    const urls = { "book/one.webp": SIGNED, "book/two.webp": SIGNED };
    expect(withImageUrls(withoutImageUrls(nested), urls)).toEqual(withImageUrls(nested, urls));
  });
});

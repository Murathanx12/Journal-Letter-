import { describe, expect, it } from "vitest";

import { filterCorrections } from "@/lib/proofread/filter";
import { isSpellingOnlyChange } from "@/lib/proofread/spelling-guard";
import { applyParagraphCorrections, toParagraphs } from "@/lib/text/apply-corrections";
import { changeRatio, diffWords, hasRealChange, wordChangeStats } from "@/lib/text/diff";
import { fromPlainText, toPlainText, type RichTextDoc } from "@/lib/text/rich-text";

/**
 * Preservation.
 *
 * The product promise is that machine assistance fixes mistakes without
 * removing the person who wrote them, and that the original is always
 * recoverable. These are the tests for that promise.
 */

describe("filterCorrections in gentle mode", () => {
  it("keeps a genuine spelling fix", () => {
    const paragraphs = ["I recieve your letters every morning."];
    const result = filterCorrections(
      paragraphs,
      [{ index: 0, corrected: "I receive your letters every morning.", notes: ["recieve -> receive"] }],
      "gentle",
    );

    expect(result).toHaveLength(1);
    expect(result[0]?.corrected).toBe("I receive your letters every morning.");
    expect(result[0]?.original).toBe(paragraphs[0]);
  });

  it("refuses to turn affection into formal English", () => {
    // The example from the specification. This must never reach the writer as a
    // suggestion, however confidently the model proposes it.
    const paragraphs = ["I love you sooo much askim"];
    const result = filterCorrections(
      paragraphs,
      [{ index: 0, corrected: "I love you very much, my darling.", notes: ["tone"] }],
      "gentle",
    );

    expect(result).toEqual([]);
  });

  it("allows the same rewrite when the writer explicitly asked to polish", () => {
    const paragraphs = ["I love you sooo much askim"];
    const result = filterCorrections(
      paragraphs,
      [{ index: 0, corrected: "I love you very much, my darling.", notes: [] }],
      "polish",
    );

    expect(result).toHaveLength(1);
  });

  it("leaves repeated letters and pet names alone when only punctuation changed", () => {
    const paragraphs = ["good morning askim i missed you sooo much"];
    const result = filterCorrections(
      paragraphs,
      [{ index: 0, corrected: "Good morning askim, I missed you sooo much.", notes: ["capitals"] }],
      "gentle",
    );

    expect(result).toHaveLength(1);
    expect(result[0]?.corrected).toContain("askim");
    expect(result[0]?.corrected).toContain("sooo");
  });

  it("drops a correction that would empty the paragraph", () => {
    expect(
      filterCorrections(["Something heartfelt."], [{ index: 0, corrected: "   " }], "gentle"),
    ).toEqual([]);
  });

  it("ignores a hallucinated paragraph index", () => {
    expect(
      filterCorrections(["only one paragraph"], [{ index: 7, corrected: "invented" }], "gentle"),
    ).toEqual([]);
  });

  it("ignores a correction that changes nothing", () => {
    expect(
      filterCorrections(["Unchanged text."], [{ index: 0, corrected: "Unchanged text." }], "gentle"),
    ).toEqual([]);
  });

  it("ignores malformed entries rather than throwing", () => {
    expect(
      filterCorrections(
        ["some text"],
        [{ index: "0", corrected: "x" }, { corrected: "y" }, { index: 0 }],
        "gentle",
      ),
    ).toEqual([]);
  });

  it("takes only the first correction for a repeated index", () => {
    const result = filterCorrections(
      ["teh cat"],
      [
        { index: 0, corrected: "the cat" },
        { index: 0, corrected: "A cat sat." },
      ],
      "gentle",
    );

    expect(result).toHaveLength(1);
    expect(result[0]?.corrected).toBe("the cat");
  });
});

describe("isSpellingOnlyChange", () => {
  it("allows a misspelling replaced by the same word spelled correctly", () => {
    expect(
      isSpellingOnlyChange(
        "I recieve your letters every morning",
        "I receive your letters every morning",
      ),
    ).toBe(true);
  });

  it("allows a transposition, the commonest typo of all", () => {
    expect(isSpellingOnlyChange("teh cat", "the cat")).toBe(true);
  });

  it("allows pure capitalisation and punctuation, however much text it touches", () => {
    expect(
      isSpellingOnlyChange(
        "good morning askim i missed you sooo much",
        "Good morning askim, I missed you sooo much.",
      ),
    ).toBe(true);
  });

  it("allows a missing apostrophe", () => {
    expect(isSpellingOnlyChange("i dont know", "I don't know")).toBe(true);
  });

  it("allows an accidentally doubled word to be removed", () => {
    expect(isSpellingOnlyChange("I miss the the ferry", "I miss the ferry")).toBe(true);
  });

  it("allows a word that was accidentally joined to be split", () => {
    expect(isSpellingOnlyChange("goodmorning askim", "good morning askim")).toBe(true);
  });

  it("refuses swapping a word for a different word", () => {
    expect(isSpellingOnlyChange("I love you sooo much askim", "I love you very much askim")).toBe(
      false,
    );
  });

  it("refuses replacing a term of endearment", () => {
    expect(
      isSpellingOnlyChange("I love you sooo much askim", "I love you very much, my darling."),
    ).toBe(false);
  });

  it("refuses inserting a word that was never written", () => {
    expect(isSpellingOnlyChange("I went to shop", "I went to the shop")).toBe(false);
  });

  it("refuses deleting a word that was not a duplicate", () => {
    expect(isSpellingOnlyChange("I really do miss you", "I do miss you")).toBe(false);
  });

  it("refuses reordering", () => {
    expect(isSpellingOnlyChange("the grey ferry", "the ferry grey")).toBe(false);
  });

  it("refuses wholesale replacement of a long paragraph", () => {
    expect(
      isSpellingOnlyChange(
        "we walked along the harbour and it rained the whole way home",
        "The two of us strolled beside the waterfront while precipitation continued throughout our return journey",
      ),
    ).toBe(false);
  });

  it("leaves words in another language alone, because a translation is never a near-neighbour", () => {
    // The multilingual promise. A model that "helpfully" translates or swaps a
    // word it did not recognise is rejected on the shape of the change alone,
    // with no dictionary involved.
    expect(isSpellingOnlyChange("seni cok seviyorum", "I love you very much")).toBe(false);
    expect(isSpellingOnlyChange("gunaydin askim", "good morning darling")).toBe(false);
    expect(isSpellingOnlyChange("hayatim benim", "my life")).toBe(false);
  });

  it("still allows a genuine typo inside non-English text", () => {
    // One transposed letter in a Turkish word is still just a typo.
    expect(isSpellingOnlyChange("gunaydni askim", "gunaydin askim")).toBe(true);
  });

  it("refuses swapping one short foreign word for another", () => {
    // Short words must not drift: two edits are only credible in a long word.
    expect(isSpellingOnlyChange("canim benim", "canim seni")).toBe(false);
  });

  it("keeps accented characters intact", () => {
    expect(isSpellingOnlyChange("günaydın aşkım", "günaydın aşkım.")).toBe(true);
    expect(isSpellingOnlyChange("günaydın aşkım", "good morning")).toBe(false);
  });
});

describe("wordChangeStats", () => {
  it("ignores case and punctuation entirely", () => {
    expect(wordChangeStats("good morning askim", "Good morning, askim!").changed).toBe(0);
  });

  it("counts a substituted word as one removed and one added", () => {
    expect(wordChangeStats("the grey ferry", "the red ferry").changed).toBe(2);
  });

  it("is zero for identical text", () => {
    const stats = wordChangeStats("same words here", "same words here");
    expect(stats.changed).toBe(0);
    expect(stats.ratio).toBe(0);
  });
});

describe("changeRatio", () => {
  it("is zero for identical text and positive for a change", () => {
    expect(changeRatio("same words here", "same words here")).toBe(0);
    expect(changeRatio("same words here", "different words here")).toBeGreaterThan(0);
  });
});

describe("diffWords", () => {
  it("marks only what actually changed", () => {
    const ops = diffWords("I recieve your letters", "I receive your letters");

    expect(ops.filter((op) => op.type === "removed").map((op) => op.value)).toEqual(["recieve"]);
    expect(ops.filter((op) => op.type === "added").map((op) => op.value)).toEqual(["receive"]);
    expect(ops.filter((op) => op.type === "same").map((op) => op.value).join("")).toContain("your letters");
  });

  it("can rebuild both sides exactly", () => {
    const before = "good morning  askim";
    const after = "Good morning, askim.";
    const ops = diffWords(before, after);

    const rebuiltBefore = ops
      .filter((op) => op.type !== "added")
      .map((op) => op.value)
      .join("");
    const rebuiltAfter = ops
      .filter((op) => op.type !== "removed")
      .map((op) => op.value)
      .join("");

    expect(rebuiltBefore).toBe(before);
    expect(rebuiltAfter).toBe(after);
  });

  it("treats a whitespace-only difference as no real change", () => {
    expect(hasRealChange("hello there", "hello there  ")).toBe(false);
    expect(hasRealChange("hello there", "hello, there")).toBe(true);
  });
});

describe("applyParagraphCorrections", () => {
  const doc: RichTextDoc = fromPlainText("teh first paragraph\n\nthe second paragraph");

  it("replaces only the paragraph that was accepted", () => {
    const result = applyParagraphCorrections(doc, [
      { original: "teh first paragraph", corrected: "the first paragraph" },
    ]);

    expect(toPlainText(result)).toBe("the first paragraph\nthe second paragraph");
  });

  it("leaves the document untouched when nothing was accepted", () => {
    expect(applyParagraphCorrections(doc, [])).toBe(doc);
  });

  it("refuses to overwrite a paragraph that has since been edited", () => {
    // The writer kept typing while the check was running, so the text the model
    // saw no longer exists. Applying it would silently destroy newer words.
    const moved = fromPlainText("teh first paragraph, now with more words\n\nthe second paragraph");

    const result = applyParagraphCorrections(moved, [
      { original: "teh first paragraph", corrected: "the first paragraph" },
    ]);

    expect(toPlainText(result)).toBe(toPlainText(moved));
  });

  it("consumes each correction once when two paragraphs are identical", () => {
    const repeated = fromPlainText("I love you.\n\nI love you.");

    const result = applyParagraphCorrections(repeated, [
      { original: "I love you.", corrected: "I love you!" },
    ]);

    expect(toPlainText(result)).toBe("I love you!\nI love you.");
  });

  it("keeps hard breaks inside a corrected paragraph", () => {
    const withBreak = fromPlainText("first line\nsecond line");
    const [paragraph] = toParagraphs(withBreak);

    const result = applyParagraphCorrections(withBreak, [
      { original: paragraph!, corrected: "First line\nSecond line" },
    ]);

    expect(toPlainText(result)).toBe("First line\nSecond line");
  });
});

describe("toParagraphs", () => {
  it("indexes blocks in the order the proofreader will see them", () => {
    expect(toParagraphs(fromPlainText("one\n\ntwo\n\nthree"))).toEqual(["one", "two", "three"]);
  });
});

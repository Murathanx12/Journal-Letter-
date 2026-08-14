import { describe, expect, it } from "vitest";

import { DictionaryProofreadProvider } from "@/lib/proofread/dictionary-provider";

/**
 * The offline spell checker.
 *
 * Half of these tests assert what it *declines* to touch. That is the point of
 * the design: an earlier version used an English dictionary and flagged every
 * unfamiliar word, which turned `askim` into `skim`. These pin the behaviour so
 * that cannot come back.
 */

const provider = new DictionaryProofreadProvider();

async function check(paragraph: string): Promise<string> {
  const result = await provider.proofread({ paragraphs: [paragraph], mode: "gentle" });
  return result.corrections[0]?.corrected ?? paragraph;
}

describe("what it corrects", () => {
  it("fixes known misspellings", async () => {
    expect(await check("I recieve your letters every morning")).toBe(
      "I receive your letters every morning",
    );
    expect(await check("I sent teh letter yesterday")).toBe("I sent the letter yesterday");
    expect(await check("this is definately happening")).toBe("this is definitely happening");
  });

  it("restores a missing apostrophe", async () => {
    expect(await check("i dont know")).toBe("I don't know");
  });

  it("capitalises the pronoun I", async () => {
    expect(await check("i miss you and i am tired")).toBe("I miss you and I am tired");
  });

  it("leaves i alone when it is part of something else", async () => {
    expect(await check("the i-40 highway")).toBe("the i-40 highway");
  });

  it("removes an accidentally repeated word", async () => {
    expect(await check("I miss the the ferry")).toBe("I miss the ferry");
  });

  it("keeps the capitalisation of the word it replaces", async () => {
    expect(await check("Recieve this with love")).toBe("Receive this with love");
    expect(await check("Becuase I said so")).toBe("Because I said so");
  });

  it("corrects several words in one paragraph", async () => {
    expect(await check("teh weather was definately wierd")).toBe(
      "the weather was definitely weird",
    );
  });
});

describe("what it refuses to touch", () => {
  it("leaves Turkish alone", async () => {
    // The exact failure that made a dictionary unusable here.
    for (const sentence of [
      "gunaydin askim seni cok seviyorum",
      "hayatim benim iyi geceler",
      "canim bugun nasilsin",
      "günaydın aşkım",
    ]) {
      expect(await check(sentence)).toBe(sentence);
    }
  });

  it("leaves pet names and invented spellings alone", async () => {
    expect(await check("I love you sooo much askim")).toBe("I love you sooo much askim");
    expect(await check("hahaha yaaay awww")).toBe("hahaha yaaay awww");
  });

  it("leaves names and places alone", async () => {
    const sentence = "We walked around Victoria Harbour with Murathan and Rosie";
    expect(await check(sentence)).toBe(sentence);
  });

  it("leaves acronyms alone", async () => {
    expect(await check("The BBC and the NHS")).toBe("The BBC and the NHS");
  });

  it("does not touch correct writing at all", async () => {
    const sentence = "It rained all night and I kept thinking about the ferry.";
    expect(await check(sentence)).toBe(sentence);
  });

  it("leaves words that are only sometimes wrong", async () => {
    // "its" and "lets" are real words; choosing between them needs to
    // understand the sentence, which this does not attempt.
    expect(await check("its lovely and lets go")).toBe("its lovely and lets go");
  });

  it("does not treat a repeated word across punctuation as a mistake", async () => {
    const sentence = "I knew that, that was the point";
    expect(await check(sentence)).toBe(sentence);
  });
});

describe("result shape", () => {
  it("reports nothing when a paragraph did not change", async () => {
    const result = await provider.proofread({
      paragraphs: ["gunaydin askim", "all correct here"],
      mode: "gentle",
    });

    expect(result.corrections).toEqual([]);
    expect(result.unchanged).toBe(true);
  });

  it("keeps paragraph indices so the right line is marked", async () => {
    const result = await provider.proofread({
      paragraphs: ["this line is fine", "but I recieve this one wrong"],
      mode: "gentle",
    });

    expect(result.corrections).toHaveLength(1);
    expect(result.corrections[0]!.index).toBe(1);
    expect(result.corrections[0]!.corrected).toContain("receive");
  });

  it("explains each change", async () => {
    const result = await provider.proofread({
      paragraphs: ["teh cat"],
      mode: "gentle",
    });

    expect(result.corrections[0]!.notes).toContain("teh → the");
  });
});

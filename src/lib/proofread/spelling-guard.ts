import { damerauLevenshtein } from "@/lib/text/edit-distance";

/**
 * The strict guard for spelling-only corrections.
 *
 * The prompt asks the model to fix nothing but obvious typos. This decides
 * whether it actually did, by inspecting every individual change rather than
 * trusting an overall similarity score. A paragraph is accepted only if *every*
 * change in it is one of a small number of provably-typographical edits:
 *
 *   • the same word with different case or surrounding punctuation
 *     ("i" → "I", "askim" → "askim,")
 *   • a near-neighbour of the original — a plausible mistyping
 *     ("teh" → "the", "recieve" → "receive")
 *   • a doubled word removed ("the the" → "the")
 *   • one word split into two, or two joined into one, with the same letters
 *     ("goodmorning" → "good morning")
 *
 * Anything else — a word swapped for a different word, a word inserted, a
 * phrase rearranged — rejects the whole paragraph. That is what stops
 * "sooo much askim" from becoming "very much, my darling".
 *
 * This is also how the multilingual promise is kept. The rule is about the
 * *shape* of the change, not about any dictionary, so a Turkish word can only
 * ever be replaced by something spelled almost identically. A model that
 * "helpfully" translates or substitutes a word it did not recognise is rejected
 * automatically, because the replacement is nowhere near the original.
 */

/** How far a word may move and still count as a typo rather than a new word. */
function isNearNeighbour(before: string, after: string): boolean {
  const a = normaliseWord(before);
  const b = normaliseWord(after);

  // Case or punctuation only.
  if (a === b) return true;

  // Never let a word be replaced by nothing, or created from nothing.
  if (a.length === 0 || b.length === 0) return false;

  const distance = damerauLevenshtein(a, b);
  const longest = Math.max(a.length, b.length);

  // A single edit is a typo at any length. A second edit is only credible in a
  // word long enough that two slips are plausible — which also keeps short
  // words in any language from being swapped for different short words.
  if (distance <= 1) return true;
  if (distance === 2 && longest >= 8) return true;

  return false;
}

/** Lower-case, and strip punctuation from the ends but not the middle. */
export function normaliseWord(word: string): string {
  return word
    .toLowerCase()
    .replace(/^[^\p{L}\p{N}]+/u, "")
    .replace(/[^\p{L}\p{N}]+$/u, "");
}

function splitWords(text: string): string[] {
  return text.split(/\s+/).filter((word) => word.length > 0);
}

type Block =
  | { type: "same"; words: string[] }
  | { type: "changed"; removed: string[]; added: string[] };

/** Longest-common-subsequence diff over words, grouped into runs. */
function diffBlocks(a: string[], b: string[]): Block[] {
  const lengths: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0),
  );

  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lengths[i]![j] =
        a[i] === b[j]
          ? lengths[i + 1]![j + 1]! + 1
          : Math.max(lengths[i + 1]![j]!, lengths[i]![j + 1]!);
    }
  }

  const blocks: Block[] = [];
  let i = 0;
  let j = 0;

  const pushSame = (word: string) => {
    const last = blocks.at(-1);
    if (last?.type === "same") last.words.push(word);
    else blocks.push({ type: "same", words: [word] });
  };

  const pushChanged = (removed: string | null, added: string | null) => {
    const last = blocks.at(-1);
    const block: Block =
      last?.type === "changed" ? last : { type: "changed", removed: [], added: [] };
    if (last?.type !== "changed") blocks.push(block);
    if (block.type === "changed") {
      if (removed !== null) block.removed.push(removed);
      if (added !== null) block.added.push(added);
    }
  };

  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      pushSame(a[i]!);
      i++;
      j++;
    } else if (lengths[i + 1]![j]! >= lengths[i]![j + 1]!) {
      pushChanged(a[i]!, null);
      i++;
    } else {
      pushChanged(null, b[j]!);
      j++;
    }
  }

  while (i < a.length) pushChanged(a[i++]!, null);
  while (j < b.length) pushChanged(null, b[j++]!);

  return blocks;
}

function joinNormalised(words: string[]): string {
  return words.map(normaliseWord).join("");
}

/**
 * Is every change between these two paragraphs a plausible typo fix?
 */
export function isSpellingOnlyChange(original: string, corrected: string): boolean {
  const before = splitWords(original);
  const after = splitWords(corrected);

  // A correction that empties the paragraph is never a spelling fix.
  if (after.length === 0 && before.length > 0) return false;

  const blocks = diffBlocks(before, after);

  for (let index = 0; index < blocks.length; index++) {
    const block = blocks[index]!;
    if (block.type === "same") continue;

    const { removed, added } = block;

    // Straight substitutions, one for one.
    if (removed.length === added.length) {
      const everyPairIsTypo = removed.every((word, position) =>
        isNearNeighbour(word, added[position]!),
      );
      if (!everyPairIsTypo) return false;
      continue;
    }

    // One word split into several, or several joined into one — same letters,
    // different spacing. "goodmorning" → "good morning".
    if (
      removed.length > 0 &&
      added.length > 0 &&
      joinNormalised(removed) === joinNormalised(added)
    ) {
      continue;
    }

    // Words removed and nothing put back: only a doubled word may vanish.
    if (added.length === 0) {
      const neighbours = [
        ...((blocks[index - 1]?.type === "same"
          ? (blocks[index - 1] as { words: string[] }).words.slice(-1)
          : []) as string[]),
        ...((blocks[index + 1]?.type === "same"
          ? (blocks[index + 1] as { words: string[] }).words.slice(0, 1)
          : []) as string[]),
      ].map(normaliseWord);

      const everyRemovedIsADuplicate = removed.every((word) =>
        neighbours.includes(normaliseWord(word)),
      );
      if (!everyRemovedIsADuplicate) return false;
      continue;
    }

    // Anything else — most importantly, words appearing out of nowhere — is a
    // rewrite, not a correction.
    return false;
  }

  return true;
}

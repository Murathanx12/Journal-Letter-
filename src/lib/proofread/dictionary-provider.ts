import { correctionFor } from "./common-typos";
import type {
  ParagraphCorrection,
  ProofreadProvider,
  ProofreadRequest,
  ProofreadResult,
} from "./types";

/**
 * Spell checking against a list of known English misspellings.
 *
 * Runs in this application, on this server. No external service, no API key,
 * nothing to pay for, and the text does not leave the trust boundary that
 * already holds it.
 *
 * See `common-typos.ts` for why this is a list of known mistakes rather than a
 * dictionary of known words. The short version: a dictionary treats every
 * Turkish word as a mistake and offers the nearest English one, which turned
 * `askim` into `skim`. This cannot do that, because it only ever recognises
 * spellings that are never correct in English.
 *
 * It also catches two things a word list cannot: a word accidentally typed
 * twice, and a lower-case "i" used as the pronoun.
 */

/** Letters, apostrophes and hyphens. Deliberately excludes digits. */
const WORD_PATTERN = /\p{L}[\p{L}\p{M}'’-]*/gu;

type Replacement = { start: number; end: number; word: string; suggestion: string };

/** Copy the original word's capitalisation onto the replacement. */
function matchCase(original: string, replacement: string): string {
  if (original.length > 1 && original === original.toUpperCase()) {
    return replacement.toUpperCase();
  }
  if (original[0] === original[0]?.toUpperCase()) {
    return replacement.charAt(0).toUpperCase() + replacement.slice(1);
  }
  return replacement;
}

function findReplacements(paragraph: string): Replacement[] {
  const replacements: Replacement[] = [];
  const words = [...paragraph.matchAll(WORD_PATTERN)];

  words.forEach((match, position) => {
    const word = match[0];
    const start = match.index;

    // A known misspelling.
    const correction = correctionFor(word);
    if (correction) {
      const cased = matchCase(word, correction);
      if (cased !== word) {
        replacements.push({ start, end: start + word.length, word, suggestion: cased });
      }
      return;
    }

    // The pronoun "I", written lower case. Only when it stands alone, so "i.e."
    // and anything hyphenated is left be.
    if (word === "i") {
      replacements.push({ start, end: start + 1, word, suggestion: "I" });
      return;
    }

    // The same word typed twice in a row. Only flagged when nothing but spaces
    // sits between them, so "that that" across a comma is not touched.
    const previous = words[position - 1];
    if (!previous) return;

    const between = paragraph.slice(previous.index + previous[0].length, start);
    if (!/^\s+$/.test(between)) return;
    if (previous[0].toLowerCase() !== word.toLowerCase()) return;

    // Remove the second one, and the space in front of it.
    replacements.push({
      start: previous.index + previous[0].length,
      end: start + word.length,
      word: `${between}${word}`,
      suggestion: "",
    });
  });

  return replacements;
}

export class DictionaryProofreadProvider implements ProofreadProvider {
  readonly name = "common-typos";

  async proofread({ paragraphs }: ProofreadRequest): Promise<ProofreadResult> {
    const corrections: ParagraphCorrection[] = [];

    paragraphs.forEach((paragraph, index) => {
      const replacements = findReplacements(paragraph);
      if (replacements.length === 0) return;

      // Rebuild back-to-front so earlier offsets stay valid.
      let corrected = paragraph;
      for (const replacement of [...replacements].reverse()) {
        corrected =
          corrected.slice(0, replacement.start) +
          replacement.suggestion +
          corrected.slice(replacement.end);
      }

      corrections.push({
        index,
        original: paragraph,
        corrected,
        notes: replacements
          .slice(0, 6)
          .map((replacement) =>
            replacement.suggestion === ""
              ? `repeated word`
              : `${replacement.word.trim()} → ${replacement.suggestion}`,
          ),
      });
    });

    return { mode: "gentle", corrections, unchanged: corrections.length === 0 };
  }
}

/** Always available: there is no key to configure and no bill to pay. */
export function getProofreadProvider(): ProofreadProvider {
  return new DictionaryProofreadProvider();
}

import { diffWords } from "@/lib/text/diff";

import type { ParagraphCorrection } from "./types";

/**
 * Turning paragraph-level corrections into individual words to highlight.
 *
 * The proofreader answers with whole corrected paragraphs. Showing that as a
 * before/after block asks somebody to accept a wall of text; showing the three
 * words that actually changed, underlined where they sit in the sentence, asks
 * them to look at three words.
 *
 * Offsets are character positions inside the block's own plain text. The editor
 * maps those onto document positions — see `spelling-suggestions.ts`.
 */

export type WordSuggestion = {
  /** Index of the top-level block this belongs to. */
  blockIndex: number;
  /** Character range within that block's plain text. */
  start: number;
  end: number;
  before: string;
  replacement: string;
  note: string;
};

/** Whitespace at the edges of a change is noise; highlight the word itself. */
function trimEdges(
  start: number,
  end: number,
  before: string,
  replacement: string,
): { start: number; end: number; before: string; replacement: string } {
  let leading = 0;
  while (leading < before.length && /\s/.test(before[leading]!)) leading++;

  let trailing = 0;
  while (trailing < before.length - leading && /\s/.test(before[before.length - 1 - trailing]!)) {
    trailing++;
  }

  if (leading === 0 && trailing === 0) return { start, end, before, replacement };

  return {
    start: start + leading,
    end: end - trailing,
    before: before.slice(leading, before.length - trailing),
    // The replacement loses the same edges, so the surrounding spacing is kept.
    replacement: replacement.trim(),
  };
}

export function toWordSuggestions(
  corrections: readonly ParagraphCorrection[],
): WordSuggestion[] {
  const suggestions: WordSuggestion[] = [];

  for (const correction of corrections) {
    const ops = diffWords(correction.original, correction.corrected);
    const note = correction.notes[0] ?? "";
    let offset = 0;

    for (let index = 0; index < ops.length; index++) {
      const op = ops[index]!;

      if (op.type === "same") {
        offset += op.value.length;
        continue;
      }

      if (op.type === "removed") {
        const start = offset;
        offset += op.value.length;

        // A removal immediately followed by an insertion is a substitution.
        const next = ops[index + 1];
        const replacement = next?.type === "added" ? next.value : "";
        if (next?.type === "added") index++;

        const trimmed = trimEdges(start, offset, op.value, replacement);
        if (trimmed.end > trimmed.start) {
          suggestions.push({
            blockIndex: correction.index,
            start: trimmed.start,
            end: trimmed.end,
            before: trimmed.before,
            replacement: trimmed.replacement,
            note,
          });
        }
        continue;
      }

      // An insertion with nothing removed before it: a missing word or mark.
      // Rendered as a zero-width marker at the insertion point.
      suggestions.push({
        blockIndex: correction.index,
        start: offset,
        end: offset,
        before: "",
        replacement: op.value,
        note,
      });
    }
  }

  return suggestions;
}

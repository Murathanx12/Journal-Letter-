import { hasRealChange, wordChangeStats } from "@/lib/text/diff";

import type { ParagraphCorrection, ProofreadMode } from "./types";

/**
 * The guard rail between a language model and somebody's love letters.
 *
 * A model told to "fix mistakes" will, given the chance, also smooth the writing
 * into something blander. The prompt asks it not to; this function assumes it
 * sometimes will anyway, and throws those suggestions away before a human ever
 * sees them.
 *
 * Pure and provider-agnostic on purpose, so it is directly testable and so a
 * future provider inherits the same protection for free.
 */

/**
 * The gentle-mode limits.
 *
 * Both are measured against *words*, with case and punctuation normalised
 * away — capitalising a sentence and adding a full stop changes many characters
 * but no vocabulary, and is exactly the kind of fix gentle mode exists for.
 *
 * Two thresholds rather than one, because a ratio alone misjudges short
 * paragraphs: correcting "teh cat" to "the cat" is a 50% change by ratio and
 * obviously a typo fix. So a suggestion is only rejected when it rewrites more
 * than a couple of words *and* a large share of them.
 */
export const GENTLE_CHANGE_LIMIT = 0.25;
export const GENTLE_WORD_ALLOWANCE = 2;

/** Is this a genuine correction, or a rewrite wearing a correction's clothes? */
export function isGentleEnough(original: string, corrected: string): boolean {
  const { changed, ratio } = wordChangeStats(original, corrected);
  if (changed <= GENTLE_WORD_ALLOWANCE) return true;
  return ratio <= GENTLE_CHANGE_LIMIT;
}

export type RawCorrection = {
  index?: unknown;
  corrected?: unknown;
  notes?: unknown;
};

export function filterCorrections(
  paragraphs: readonly string[],
  raw: readonly RawCorrection[],
  mode: ProofreadMode,
): ParagraphCorrection[] {
  const corrections: ParagraphCorrection[] = [];
  const seen = new Set<number>();

  for (const candidate of raw) {
    if (typeof candidate.index !== "number" || typeof candidate.corrected !== "string") continue;

    // A hallucinated or duplicated index would corrupt a different paragraph.
    const original = paragraphs[candidate.index];
    if (typeof original !== "string") continue;
    if (seen.has(candidate.index)) continue;

    const corrected = candidate.corrected;

    // "Corrections" that change nothing are noise in the review list.
    if (!hasRealChange(original, corrected)) continue;

    // Never let a paragraph be deleted under the guise of correcting it.
    if (corrected.trim().length === 0) continue;

    if (mode === "gentle" && !isGentleEnough(original, corrected)) continue;

    const notes = Array.isArray(candidate.notes)
      ? candidate.notes.filter((note): note is string => typeof note === "string").slice(0, 6)
      : [];

    seen.add(candidate.index);
    corrections.push({ index: candidate.index, original, corrected, notes });
  }

  return corrections;
}

import { hasRealChange, wordChangeStats } from "@/lib/text/diff";

import { isSpellingOnlyChange } from "./spelling-guard";
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
 * Polish mode's limit.
 *
 * Polish is the explicitly-requested, firmer edit, so it is allowed to change
 * wording — but not to replace a paragraph wholesale. Measured against *words*,
 * with case and punctuation normalised away, and with a small absolute
 * allowance so short paragraphs are not misjudged by a ratio alone.
 */
export const POLISH_CHANGE_LIMIT = 0.5;
export const POLISH_WORD_ALLOWANCE = 4;

function isPolishEnough(original: string, corrected: string): boolean {
  const { changed, ratio } = wordChangeStats(original, corrected);
  if (changed <= POLISH_WORD_ALLOWANCE) return true;
  return ratio <= POLISH_CHANGE_LIMIT;
}

/**
 * Is this a genuine correction, or a rewrite wearing a correction's clothes?
 *
 * In `gentle` — presented as "Spelling only" — every individual change must be
 * provably typographical. See `spelling-guard.ts`.
 */
export function isAcceptableChange(
  original: string,
  corrected: string,
  mode: ProofreadMode,
): boolean {
  return mode === "gentle"
    ? isSpellingOnlyChange(original, corrected)
    : isPolishEnough(original, corrected);
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

    if (!isAcceptableChange(original, corrected, mode)) continue;

    const notes = Array.isArray(candidate.notes)
      ? candidate.notes.filter((note): note is string => typeof note === "string").slice(0, 6)
      : [];

    seen.add(candidate.index);
    corrections.push({ index: candidate.index, original, corrected, notes });
  }

  return corrections;
}

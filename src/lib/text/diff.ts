/**
 * A word-level diff, used to show exactly what a proofreading pass wants to
 * change before anything is accepted.
 *
 * Word-level rather than character-level on purpose: "recieve" → "receive"
 * shown as a whole-word swap is instantly readable, whereas the character
 * version ("rec[ie→ei]ve") is a puzzle. These are letters, and the person
 * reviewing them cares about words.
 *
 * Standard LCS. The inputs are single paragraphs, so the O(n·m) table is
 * comfortably small.
 */

export type DiffOp =
  | { type: "same"; value: string }
  | { type: "added"; value: string }
  | { type: "removed"; value: string };

/** Split into words while keeping the whitespace, so output can be rebuilt exactly. */
function tokenize(text: string): string[] {
  return text.match(/\s+|[^\s]+/g) ?? [];
}

export function diffWords(before: string, after: string): DiffOp[] {
  const a = tokenize(before);
  const b = tokenize(after);

  // lengths[i][j] = LCS length of a[i..] and b[j..]
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

  const ops: DiffOp[] = [];
  let i = 0;
  let j = 0;

  const push = (type: DiffOp["type"], value: string) => {
    const last = ops.at(-1);
    // Merge runs so the UI renders "very much" as one change, not two.
    if (last && last.type === type) last.value += value;
    else ops.push({ type, value } as DiffOp);
  };

  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      push("same", a[i]!);
      i++;
      j++;
    } else if (lengths[i + 1]![j]! >= lengths[i]![j + 1]!) {
      push("removed", a[i]!);
      i++;
    } else {
      push("added", b[j]!);
      j++;
    }
  }

  while (i < a.length) push("removed", a[i++]!);
  while (j < b.length) push("added", b[j++]!);

  return ops;
}

/** True when the two strings differ by more than trailing whitespace. */
export function hasRealChange(before: string, after: string): boolean {
  return before.trim() !== after.trim();
}

/**
 * How much of the paragraph the model wants to rewrite, 0–1.
 *
 * Used as a guard rail: "gentle" corrections that touch a large share of the
 * words are not gentle, whatever the model says, and get held back.
 */
export function changeRatio(before: string, after: string): number {
  const ops = diffWords(before, after);
  let changed = 0;
  let total = 0;

  for (const op of ops) {
    const weight = op.value.trim().length;
    if (weight === 0) continue;
    total += weight;
    if (op.type !== "same") changed += weight;
  }

  return total === 0 ? 0 : changed / total;
}

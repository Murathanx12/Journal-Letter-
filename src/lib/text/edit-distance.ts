/**
 * Damerau–Levenshtein distance (optimal string alignment).
 *
 * Plain Levenshtein counts a transposition as two edits, which would score
 * "teh" → "the" the same as a completely different word. Since transposed
 * letters are the single most common typing mistake, they have to cost 1 for
 * any of this to be useful.
 *
 * Operates on code points rather than UTF-16 units, so accented and non-Latin
 * characters count as one character each — this is used on writing that mixes
 * languages.
 */
export function damerauLevenshtein(a: string, b: string): number {
  const source = Array.from(a);
  const target = Array.from(b);

  if (source.length === 0) return target.length;
  if (target.length === 0) return source.length;

  const distance: number[][] = Array.from({ length: source.length + 1 }, () =>
    new Array<number>(target.length + 1).fill(0),
  );

  for (let i = 0; i <= source.length; i++) distance[i]![0] = i;
  for (let j = 0; j <= target.length; j++) distance[0]![j] = j;

  for (let i = 1; i <= source.length; i++) {
    for (let j = 1; j <= target.length; j++) {
      const cost = source[i - 1] === target[j - 1] ? 0 : 1;

      let value = Math.min(
        distance[i - 1]![j]! + 1, // deletion
        distance[i]![j - 1]! + 1, // insertion
        distance[i - 1]![j - 1]! + cost, // substitution
      );

      // Transposition of two adjacent characters.
      if (
        i > 1 &&
        j > 1 &&
        source[i - 1] === target[j - 2] &&
        source[i - 2] === target[j - 1]
      ) {
        value = Math.min(value, distance[i - 2]![j - 2]! + 1);
      }

      distance[i]![j] = value;
    }
  }

  return distance[source.length]![target.length]!;
}

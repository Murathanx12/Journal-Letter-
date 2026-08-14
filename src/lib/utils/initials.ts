/**
 * Up to two initials from a display name, for avatar fallbacks.
 *
 * Uses `Array.from` rather than indexing, so names starting with an emoji or a
 * character outside the basic plane are not sliced in half.
 */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";

  const first = Array.from(words[0]!)[0] ?? "";
  if (words.length === 1) return first.toUpperCase();

  const last = Array.from(words.at(-1)!)[0] ?? "";
  return `${first}${last}`.toUpperCase();
}

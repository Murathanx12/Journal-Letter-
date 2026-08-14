import type { CalendarDate } from "@/lib/date/calendar-date";

/**
 * Compiling loose entries into a book.
 *
 * This is the heart of the product and it is deliberately pure: no database, no
 * React, no dates-as-instants. Given rows, it produces the day-by-day structure
 * that the reading view, the PDF and the DOCX all render from, so those three
 * can never disagree about what the book says.
 *
 * The ordering rule:
 *
 *   Days are ordered by `entryDate`.
 *   Within a day, whoever submitted first appears first.
 *
 * "Submitted first" is `withinDayOrder`, falling back to `createdAt`. Keeping an
 * explicit integer means a historical import can be re-ordered by hand later
 * without rewriting timestamps — which would be a lie about when it was typed.
 */

export type CompiledEntry = {
  id: string;
  authorId: string;
  entryDate: CalendarDate;
  withinDayOrder: number;
  createdAt: string;
  title: string | null;
  /** The rich-text document to render. */
  content: unknown;
  plainText: string;
  correctionState: "original" | "gentle" | "polish";
  hasOriginal: boolean;
  tags: string[];
  mood: string | null;
  location: string | null;
  sealedUntil: CalendarDate | null;
  status: "draft" | "published";
};

export type BookDay = {
  date: CalendarDate;
  entries: CompiledEntry[];
};

export function compareWithinDay(a: CompiledEntry, b: CompiledEntry): number {
  if (a.withinDayOrder !== b.withinDayOrder) return a.withinDayOrder - b.withinDayOrder;
  // Same explicit order (the common case — both default to 0), so fall back to
  // who actually hit save first.
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
  // Last resort, for stability: never let two entries swap places between renders.
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Group entries into days.
 *
 * @param direction `asc` reads like a book, from the beginning. `desc` puts the
 *   most recent day first, which is what the book's home screen wants.
 */
export function groupEntriesByDay(
  entries: readonly CompiledEntry[],
  direction: "asc" | "desc" = "asc",
): BookDay[] {
  const byDate = new Map<CalendarDate, CompiledEntry[]>();

  for (const entry of entries) {
    const bucket = byDate.get(entry.entryDate);
    if (bucket) bucket.push(entry);
    else byDate.set(entry.entryDate, [entry]);
  }

  const days: BookDay[] = [...byDate.entries()].map(([date, dayEntries]) => ({
    date,
    entries: [...dayEntries].sort(compareWithinDay),
  }));

  days.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  if (direction === "desc") days.reverse();

  return days;
}

/**
 * The next `within_day_order` for a new entry on a given day. Appending rather
 * than inserting is what makes "whoever wrote first appears first" true.
 */
export function nextWithinDayOrder(existing: readonly { withinDayOrder: number }[]): number {
  if (existing.length === 0) return 0;
  return Math.max(...existing.map((e) => e.withinDayOrder)) + 1;
}

/**
 * Swap an entry with its neighbour inside a day, returning the (id, order)
 * pairs that need writing back. Used by the manual reordering control on
 * imported days.
 */
export function reorderWithinDay(
  dayEntries: readonly CompiledEntry[],
  entryId: string,
  direction: "up" | "down",
): { id: string; withinDayOrder: number }[] {
  const sorted = [...dayEntries].sort(compareWithinDay);
  const index = sorted.findIndex((entry) => entry.id === entryId);
  if (index === -1) return [];

  const target = direction === "up" ? index - 1 : index + 1;
  if (target < 0 || target >= sorted.length) return [];

  const swapped = [...sorted];
  const a = swapped[index]!;
  const b = swapped[target]!;
  swapped[index] = b;
  swapped[target] = a;

  // Renumber the whole day so the result is unambiguous even when several
  // entries previously shared order 0.
  return swapped.map((entry, position) => ({ id: entry.id, withinDayOrder: position }));
}

export function totalWords(entries: readonly CompiledEntry[]): number {
  return entries.reduce((sum, entry) => {
    const trimmed = entry.plainText.trim();
    return sum + (trimmed ? trimmed.split(/\s+/).length : 0);
  }, 0);
}

/** Is this entry still sealed, as of the book's today? */
export function isSealed(entry: Pick<CompiledEntry, "sealedUntil">, bookToday: CalendarDate): boolean {
  return entry.sealedUntil !== null && entry.sealedUntil > bookToday;
}

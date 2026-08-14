import "server-only";

import { getBook, getBookMembers } from "@/lib/books/queries";
import { formatLongDate, type CalendarDate } from "@/lib/date/calendar-date";
import { getAllEntriesForExport } from "@/lib/entries/queries";

import { toExportBlocks, type ExportDay, type ExportDocument } from "./document";

/**
 * Turn a book into a printable document.
 *
 * `textVersion` is the important argument. "original" prints what each person
 * actually wrote, machine corrections discarded; "current" prints the book as it
 * reads today. Whichever is chosen is recorded on the title page, so a printed
 * copy never quietly misrepresents itself.
 *
 * Everything here runs through the caller's session, so RLS decides what is
 * included. Exporting cannot reach past book membership.
 */
export async function compileBookForExport(
  bookId: string,
  options: {
    textVersion: "original" | "current";
    from?: CalendarDate;
    to?: CalendarDate;
    includeCover: boolean;
  },
): Promise<ExportDocument> {
  const [book, members, { days, originals }] = await Promise.all([
    getBook(bookId),
    getBookMembers(bookId),
    getAllEntriesForExport(bookId, { from: options.from, to: options.to }),
  ]);

  const nameById = new Map(members.map((member) => [member.userId, member.displayName]));

  const exportDays: ExportDay[] = days.map((day) => ({
    date: day.date,
    entries: day.entries.map((entry) => {
      // Fall back to the current text when an entry was never corrected — its
      // current version *is* the original.
      const original = originals.get(entry.id);
      const useOriginal = options.textVersion === "original" && original !== undefined;
      const content = useOriginal ? original.content : entry.content;

      return {
        id: entry.id,
        authorName: nameById.get(entry.authorId) ?? "A writer",
        title: entry.title,
        blocks: toExportBlocks(content),
        corrected: !useOriginal && entry.correctionState !== "original",
      };
    }),
  }));

  const first = exportDays[0]?.date;
  const last = exportDays.at(-1)?.date;

  return {
    title: book.title,
    subtitle: book.subtitle,
    contributors: members.map((member) => member.displayName),
    dateRangeLabel:
      first && last
        ? first === last
          ? formatLongDate(first)
          : `${formatLongDate(first)} – ${formatLongDate(last)}`
        : null,
    design: book.resolvedDesign,
    days: exportDays,
    includeCover: options.includeCover,
    textVersion: options.textVersion,
    generatedAt: new Date().toISOString(),
  };
}

/** A filesystem-safe filename that still looks like the book. */
export function exportFilename(title: string, extension: string): string {
  const slug =
    title
      .normalize("NFKD")
      .replace(/[^\w\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .slice(0, 60)
      .toLowerCase() || "book";
  return `${slug}.${extension}`;
}

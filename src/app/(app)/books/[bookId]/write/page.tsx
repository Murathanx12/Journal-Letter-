import { EntryComposer } from "@/components/editor/entry-composer";
import { getWritableBook } from "@/lib/books/queries";
import { isCalendarDate } from "@/lib/date/calendar-date";
import { featureFlags } from "@/lib/env";

export default async function WritePage({
  params,
  searchParams,
}: {
  params: Promise<{ bookId: string }>;
  searchParams: Promise<{ date?: string }>;
}) {
  const { bookId } = await params;
  const { date } = await searchParams;

  // 404s rather than 403s for readers without write access.
  const book = await getWritableBook(bookId);

  // The calendar links here with a specific day; anything malformed falls back
  // to today rather than erroring.
  const startDate = date && isCalendarDate(date) ? date : book.today;

  return (
    <div className="mx-auto max-w-3xl">
      <EntryComposer
        bookId={book.id}
        bookToday={startDate}
        entry={null}
        aiAvailable={featureFlags.aiProofreading}
        indentParagraphs={book.resolvedDesign.preset.indentParagraphs}
      />
    </div>
  );
}

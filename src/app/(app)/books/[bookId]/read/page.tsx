import { BookOpen, Printer, Rows3, BookMarked } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { BookPages } from "@/components/book/book-pages";
import { BookSurface } from "@/components/book/book-surface";
import { DayHeading } from "@/components/book/day-heading";
import { EntryBlock, SealedEntryBlock } from "@/components/book/entry-block";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/surface";
import { getSessionUser } from "@/lib/auth/session";
import { getBook, getBookMembers } from "@/lib/books/queries";
import { formatLongDate, isCalendarDate, type CalendarDate } from "@/lib/date/calendar-date";
import { getBookDays, getFavorites, getSealedPreviews, signDayMedia } from "@/lib/entries/queries";
import { PAGE_HEIGHT } from "@/lib/design/pages";
import { cn } from "@/lib/utils/cn";

/**
 * The reading view: the book itself.
 *
 * Two things are being paginated at once, and they are not the same thing.
 *
 *   * The *query* is paginated by day, because a page boundary must never fall
 *     in the middle of a date — half of 14 August followed by the other half on
 *     the next screen would be worse than useless.
 *   * The *book* is paginated into pages, in the browser, by the reading
 *     surface. Every entry opens on a fresh page, so one person's letter never
 *     runs into the next person's half way down.
 *
 * "Read older" stays an ordinary link, so the whole thing works without
 * JavaScript and each stretch of the book is individually addressable.
 */
export default async function ReadPage({
  params,
  searchParams,
}: {
  params: Promise<{ bookId: string }>;
  searchParams: Promise<{ before?: string; view?: string }>;
}) {
  const { bookId } = await params;
  const { before, view } = await searchParams;

  const cursor = before && isCalendarDate(before) ? (before as CalendarDate) : undefined;
  // Pages are the point of the reading view, so they are the default; a plain
  // scroll stays available for anyone who would rather have one long column.
  const asScroll = view === "scroll";

  const [book, members, page, favorites, sealed, user] = await Promise.all([
    getBook(bookId),
    getBookMembers(bookId),
    getBookDays(bookId, { before: cursor, dayLimit: 15 }),
    getFavorites(bookId),
    getSealedPreviews(bookId),
    getSessionUser(),
  ]);

  const memberMap = new Map(members.map((member) => [member.userId, member]));
  const mediaUrls = await signDayMedia(page.days);

  // Sealed letters are surfaced as placeholders on their own day. The content is
  // not merely hidden here — the row is withheld by an RLS policy.
  const sealedByDate = new Map<string, typeof sealed>();
  for (const item of sealed) {
    const bucket = sealedByDate.get(item.entryDate);
    if (bucket) bucket.push(item);
    else sealedByDate.set(item.entryDate, [item]);
  }

  if (page.days.length === 0 && !cursor) {
    return (
      <EmptyState
        icon={<BookOpen className="h-7 w-7" aria-hidden="true" />}
        title="There is nothing to read yet"
        description="Once entries are written they will appear here, one day after another."
        action={
          book.canWrite ? (
            <ButtonLink href={`/books/${bookId}/write`}>Write the first entry</ButtonLink>
          ) : null
        }
      />
    );
  }

  const query = (extra: Record<string, string | undefined>) => {
    const search = new URLSearchParams();
    if (cursor) search.set("before", cursor);
    if (asScroll) search.set("view", "scroll");
    for (const [key, value] of Object.entries(extra)) {
      if (value === undefined) search.delete(key);
      else search.set(key, value);
    }
    const text = search.toString();
    return text ? `?${text}` : "";
  };

  /*
    A flat list rather than a tree of days, so that "start on a new page" is a
    property of each leaf. Nesting entries inside a day element would work on
    screen and then break in print, where a fragmentation break inside a nested
    block is honoured far less reliably.
  */
  const leaves: ReactNode[] = [];

  page.days.forEach((day, dayIndex) => {
    leaves.push(
      <DayHeading
        key={`day-${day.date}`}
        date={day.date}
        preset={book.resolvedDesign.preset}
        className={cn("mb-7", dayIndex > 0 && "book-page-start")}
      />,
    );

    day.entries.forEach((entry, entryIndex) => {
      leaves.push(
        <EntryBlock
          key={entry.id}
          entry={entry}
          author={memberMap.get(entry.authorId)}
          design={book.resolvedDesign}
          bookId={bookId}
          canEdit={entry.authorId === user?.id}
          isFavorite={favorites.has(entry.id)}
          mediaUrls={mediaUrls}
          // The day's heading opens the day's first page, so only the entries
          // after it need turning onto one of their own.
          className={cn("mb-12", entryIndex > 0 && "book-page-start")}
        />,
      );
    });

    for (const item of sealedByDate.get(day.date) ?? []) {
      leaves.push(
        <SealedEntryBlock
          key={item.id}
          author={memberMap.get(item.authorId)}
          opensOn={formatLongDate(item.sealedUntil)}
          className="mb-12 book-page-start"
        />,
      );
    }
  });

  return (
    <div className="space-y-8">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-muted">
          {cursor ? `Reading back from before ${formatLongDate(cursor)}` : "Most recent first"}
        </p>

        <div className="flex items-center gap-2">
          <Link
            href={`/books/${bookId}/read${query({ view: asScroll ? undefined : "scroll" })}`}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-colors",
              "border-rule-strong text-ink-muted hover:text-ink",
            )}
          >
            {asScroll ? (
              <>
                <BookMarked className="h-3.5 w-3.5" aria-hidden="true" />
                Read as a book
              </>
            ) : (
              <>
                <Rows3 className="h-3.5 w-3.5" aria-hidden="true" />
                Read as one column
              </>
            )}
          </Link>

          <span className="inline-flex items-center gap-1.5 text-xs text-ink-muted">
            <Printer className="h-3.5 w-3.5" aria-hidden="true" />
            Ctrl/⌘ + P to print
          </span>
        </div>
      </div>

      <BookSurface design={book.resolvedDesign} members={members}>
        {asScroll ? (
          <div>{leaves}</div>
        ) : (
          <BookPages pageHeight={PAGE_HEIGHT} label={`${book.title}, page by page`}>
            {leaves}
          </BookPages>
        )}
      </BookSurface>

      <div className="no-print flex items-center justify-center gap-3 border-t border-rule pt-8">
        {page.nextCursor ? (
          <ButtonLink
            variant="secondary"
            href={`/books/${bookId}/read${query({ before: page.nextCursor })}`}
          >
            Read older
          </ButtonLink>
        ) : (
          <p className="text-sm text-ink-muted">
            {cursor ? "That is the beginning of the book." : "That is everything so far."}
          </p>
        )}

        {cursor ? (
          <ButtonLink variant="ghost" href={`/books/${bookId}/read${query({ before: undefined })}`}>
            Back to the most recent
          </ButtonLink>
        ) : null}
      </div>
    </div>
  );
}

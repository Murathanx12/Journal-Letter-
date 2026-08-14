import { BookOpen, Columns2, Printer } from "lucide-react";
import Link from "next/link";

import { BookSurface } from "@/components/book/book-surface";
import { DayHeading } from "@/components/book/day-heading";
import { EntryBlock, SealedEntryBlock } from "@/components/book/entry-block";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/surface";
import { getSessionUser } from "@/lib/auth/session";
import { getBook, getBookMembers } from "@/lib/books/queries";
import { formatLongDate, isCalendarDate, type CalendarDate } from "@/lib/date/calendar-date";
import { getBookDays, getFavorites, getSealedPreviews, signDayMedia } from "@/lib/entries/queries";
import { cn } from "@/lib/utils/cn";

/**
 * The reading view: the book itself.
 *
 * Paginated by *day* rather than by row, because a page boundary must never
 * fall in the middle of a date — half of 14 August followed by the other half
 * on the next screen would be worse than useless. "Read older" is an ordinary
 * link, so the whole thing works without JavaScript and each page is
 * individually addressable.
 */
export default async function ReadPage({
  params,
  searchParams,
}: {
  params: Promise<{ bookId: string }>;
  searchParams: Promise<{ before?: string; spread?: string }>;
}) {
  const { bookId } = await params;
  const { before, spread } = await searchParams;

  const cursor = before && isCalendarDate(before) ? (before as CalendarDate) : undefined;
  const isSpread = spread === "1";

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

  // Sealed letters are surfaced as placeholders on their own day. The content
  // is not merely hidden here — the row is withheld by an RLS policy.
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

  return (
    <div className="space-y-8">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-muted">
          {cursor ? `Reading back from before ${formatLongDate(cursor)}` : "Most recent first"}
        </p>

        <div className="flex items-center gap-2">
          <Link
            href={`/books/${bookId}/read${isSpread ? "" : "?spread=1"}`}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-colors",
              isSpread
                ? "border-ink bg-ink text-paper"
                : "border-rule-strong text-ink-muted hover:text-ink",
            )}
          >
            <Columns2 className="h-3.5 w-3.5" aria-hidden="true" />
            Two pages
          </Link>

          <span className="inline-flex items-center gap-1.5 text-xs text-ink-muted">
            <Printer className="h-3.5 w-3.5" aria-hidden="true" />
            Ctrl/⌘ + P to print
          </span>
        </div>
      </div>

      <BookSurface design={book.resolvedDesign} members={members}>
        {/*
          The spread only splits into columns at lg and above. On a phone it
          stays a single readable page, which is where most of this will be read.
        */}
        <div className={cn("book-spread space-y-14")} data-spread={isSpread ? "true" : "false"}>
          {page.days.map((day) => (
            <section key={day.date} className="space-y-8 break-inside-avoid">
              <DayHeading date={day.date} preset={book.resolvedDesign.preset} />

              <div className="mx-auto space-y-12">
                {day.entries.map((entry) => (
                  <EntryBlock
                    key={entry.id}
                    entry={entry}
                    author={memberMap.get(entry.authorId)}
                    design={book.resolvedDesign}
                    bookId={bookId}
                    canEdit={entry.authorId === user?.id}
                    isFavorite={favorites.has(entry.id)}
                    mediaUrls={mediaUrls}
                  />
                ))}

                {(sealedByDate.get(day.date) ?? []).map((item) => (
                  <SealedEntryBlock
                    key={item.id}
                    author={memberMap.get(item.authorId)}
                    opensOn={formatLongDate(item.sealedUntil)}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      </BookSurface>

      <div className="no-print flex items-center justify-center gap-3 border-t border-rule pt-8">
        {page.nextCursor ? (
          <ButtonLink
            variant="secondary"
            href={`/books/${bookId}/read?before=${page.nextCursor}${isSpread ? "&spread=1" : ""}`}
          >
            Read older
          </ButtonLink>
        ) : (
          <p className="text-sm text-ink-muted">
            {cursor ? "That is the beginning of the book." : "That is everything so far."}
          </p>
        )}

        {cursor ? (
          <ButtonLink variant="ghost" href={`/books/${bookId}/read${isSpread ? "?spread=1" : ""}`}>
            Back to the most recent
          </ButtonLink>
        ) : null}
      </div>
    </div>
  );
}

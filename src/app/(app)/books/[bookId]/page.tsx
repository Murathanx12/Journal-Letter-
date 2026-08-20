import { BookOpen, CalendarDays, FileEdit, PenLine, Users } from "lucide-react";
import Link from "next/link";

import { BookSurface } from "@/components/book/book-surface";
import { DayHeading } from "@/components/book/day-heading";
import { EntryBlock } from "@/components/book/entry-block";
import { ButtonLink } from "@/components/ui/button";
import { Card, EmptyState, PageHeader } from "@/components/ui/surface";
import { getSessionUser } from "@/lib/auth/session";
import { getBook, getBookMembers, getBookStats } from "@/lib/books/queries";
import { formatLongDate, formatShortDate } from "@/lib/date/calendar-date";
import { groupEntriesByDay } from "@/lib/entries/compile";
import { getFavorites, getMyDrafts, getRecentEntries, signEntryMedia } from "@/lib/entries/queries";

export default async function BookHomePage({
  params,
}: {
  params: Promise<{ bookId: string }>;
}) {
  const { bookId } = await params;

  const [book, members, stats, recent, drafts, favorites, user] = await Promise.all([
    getBook(bookId),
    getBookMembers(bookId),
    getBookStats(bookId),
    getRecentEntries(bookId, 4),
    getMyDrafts(bookId),
    getFavorites(bookId),
    getSessionUser(),
  ]);

  const memberMap = new Map(members.map((member) => [member.userId, member]));
  const days = groupEntriesByDay(recent, "desc");
  const mediaUrls = await signEntryMedia(recent);

  const hasWrittenToday = recent.some(
    (entry) => entry.entryDate === book.today && entry.authorId === user?.id,
  );

  return (
    <div className="space-y-10">
      <PageHeader
        title={
          <span className="sr-only">Overview</span>
        }
        description={
          stats.entryCount === 0
            ? "Nothing written yet."
            : `${stats.entryCount.toLocaleString()} ${
                stats.entryCount === 1 ? "entry" : "entries"
              } · ${stats.wordCount.toLocaleString()} words · ${stats.daysWritten} ${
                stats.daysWritten === 1 ? "day" : "days"
              } written`
        }
        actions={
          book.canWrite ? (
            <ButtonLink href={`/books/${bookId}/write`}>
              <PenLine className="h-4 w-4" aria-hidden="true" />
              {hasWrittenToday ? "Write again" : "Write today's entry"}
            </ButtonLink>
          ) : null
        }
      />

      {drafts.length > 0 ? (
        <Card className="space-y-3">
          <h2 className="flex items-center gap-2 font-serif text-base text-ink">
            <FileEdit className="h-4 w-4 text-brand" aria-hidden="true" />
            Continue where you left off
          </h2>
          <ul className="space-y-2">
            {drafts.map((draft) => (
              <li key={draft.id}>
                <Link
                  href={`/books/${bookId}/entries/${draft.id}`}
                  className="flex items-baseline justify-between gap-3 rounded-lg py-1 text-sm hover:text-ink"
                >
                  <span className="truncate text-ink-soft">
                    {draft.title ?? draft.plainText.slice(0, 60) ?? "Untitled draft"}
                  </span>
                  <span className="shrink-0 text-xs text-ink-muted">
                    {formatShortDate(draft.entryDate)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <section className="space-y-6">
        <div className="flex items-center justify-between gap-4">
          <h2 className="font-serif text-lg text-ink">Latest</h2>
          <Link
            href={`/books/${bookId}/read`}
            className="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink"
          >
            <BookOpen className="h-4 w-4" aria-hidden="true" />
            Read the book
          </Link>
        </div>

        {days.length === 0 ? (
          <EmptyState
            icon={<PenLine className="h-7 w-7" aria-hidden="true" />}
            title={book.canWrite ? "The first page is blank" : "Nothing here yet"}
            description={
              book.canWrite
                ? `It is ${formatLongDate(book.today)} in this book. Write something short — it does not have to be good.`
                : "Once somebody writes, it will appear here."
            }
            action={
              book.canWrite ? (
                <ButtonLink href={`/books/${bookId}/write`}>Write the first entry</ButtonLink>
              ) : null
            }
          />
        ) : (
          <BookSurface design={book.resolvedDesign} members={members} className="space-y-10">
            {days.map((day) => (
              <div key={day.date} className="space-y-6">
                <DayHeading date={day.date} preset={book.resolvedDesign.preset} />
                <div className="space-y-10">
                  {day.entries.map((entry, index) => (
                    <EntryBlock
                      key={entry.id}
                      entry={entry}
                      author={memberMap.get(entry.authorId)}
                      design={book.resolvedDesign}
                      bookId={bookId}
                      canEdit={entry.authorId === user?.id}
                      isFavorite={favorites.has(entry.id)}
                      mediaUrls={mediaUrls}
                      order={
                        day.entries.length > 1
                          ? { isFirst: index === 0, isLast: index === day.entries.length - 1 }
                          : undefined
                      }
                    />
                  ))}
                </div>
              </div>
            ))}
          </BookSurface>
        )}
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        <Link
          href={`/books/${bookId}/calendar`}
          className="rounded-card border border-rule bg-surface p-4 transition-colors hover:bg-surface-sunk"
        >
          <CalendarDays className="h-4 w-4 text-brand" aria-hidden="true" />
          <p className="mt-2 text-sm font-medium text-ink">Calendar</p>
          <p className="mt-0.5 text-xs text-ink-muted">
            {stats.daysWritten} {stats.daysWritten === 1 ? "day" : "days"} with writing
          </p>
        </Link>

        <Link
          href={`/books/${bookId}/read`}
          className="rounded-card border border-rule bg-surface p-4 transition-colors hover:bg-surface-sunk"
        >
          <BookOpen className="h-4 w-4 text-brand" aria-hidden="true" />
          <p className="mt-2 text-sm font-medium text-ink">Read from the start</p>
          <p className="mt-0.5 text-xs text-ink-muted">
            {stats.firstEntryDate ? `From ${formatShortDate(stats.firstEntryDate)}` : "Nothing yet"}
          </p>
        </Link>

        <Link
          href={book.type === "shared_letter_book" ? `/books/${bookId}/members` : `/books/${bookId}/export`}
          className="rounded-card border border-rule bg-surface p-4 transition-colors hover:bg-surface-sunk"
        >
          <Users className="h-4 w-4 text-brand" aria-hidden="true" />
          <p className="mt-2 text-sm font-medium text-ink">
            {book.type === "shared_letter_book" ? "Members" : "Export"}
          </p>
          <p className="mt-0.5 text-xs text-ink-muted">
            {book.type === "shared_letter_book"
              ? members.map((member) => member.displayName).join(", ")
              : "PDF, Word or Google Docs"}
          </p>
        </Link>
      </section>
    </div>
  );
}

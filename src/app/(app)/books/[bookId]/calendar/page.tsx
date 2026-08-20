import { BookOpen, ChevronLeft, ChevronRight, PenLine } from "lucide-react";
import Link from "next/link";

import { BookSurface } from "@/components/book/book-surface";
import { EntryBlock } from "@/components/book/entry-block";
import { ButtonLink } from "@/components/ui/button";
import { getSessionUser } from "@/lib/auth/session";
import { getBook, getBookMembers } from "@/lib/books/queries";
import {
  addMonths,
  daysInMonth,
  endOfMonth,
  formatLongDate,
  formatMonthYear,
  isCalendarDate,
  startOfMonth,
  weekdayIndexMondayFirst,
  type CalendarDate,
} from "@/lib/date/calendar-date";
import { getAccent } from "@/lib/design/theme";
import { getCalendar, getEntriesForDate, getFavorites, signEntryMedia } from "@/lib/entries/queries";
import { cn } from "@/lib/utils/cn";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/**
 * The calendar.
 *
 * Picking a day is the whole point, so the grid is kept small and the day sits
 * beside it rather than a screen below it. An earlier version filled the width
 * with square cells, which pushed the writing so far down the page that
 * selecting a date looked like it had done nothing at all.
 *
 * Every day is a link, whether anything was written on it or not — an empty day
 * is where you go to write one.
 */
export default async function CalendarPage({
  params,
  searchParams,
}: {
  params: Promise<{ bookId: string }>;
  searchParams: Promise<{ month?: string; date?: string }>;
}) {
  const { bookId } = await params;
  const { month, date } = await searchParams;

  const [book, members, user] = await Promise.all([
    getBook(bookId),
    getBookMembers(bookId),
    getSessionUser(),
  ]);

  // `month` arrives as YYYY-MM; anchor it to the first of that month.
  const anchor: CalendarDate =
    month && isCalendarDate(`${month}-01`)
      ? (`${month}-01` as CalendarDate)
      : startOfMonth(date && isCalendarDate(date) ? date : book.today);

  const from = startOfMonth(anchor);
  const to = endOfMonth(anchor);

  // Landing on the calendar with nothing chosen should still show something, so
  // today stands in until a day is picked.
  const selected: CalendarDate = date && isCalendarDate(date) ? date : book.today;

  const [days, dayEntries, favorites] = await Promise.all([
    getCalendar(bookId, from, to),
    getEntriesForDate(bookId, selected),
    getFavorites(bookId),
  ]);

  const byDate = new Map(days.map((day) => [day.date, day]));
  const memberMap = new Map(members.map((member) => [member.userId, member]));
  const mediaUrls = await signEntryMedia(dayEntries);

  const leadingBlanks = weekdayIndexMondayFirst(from);
  const total = daysInMonth(from);

  const previousMonth = addMonths(from, -1).slice(0, 7);
  const nextMonth = addMonths(from, 1).slice(0, 7);

  return (
    <div className="grid gap-10 lg:grid-cols-[19rem_1fr] lg:items-start lg:gap-12">
      <section className="lg:sticky lg:top-24">
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="font-serif text-lg text-ink">{formatMonthYear(from)}</h2>
          <div className="flex items-center gap-1">
            <Link
              href={`/books/${bookId}/calendar?month=${previousMonth}`}
              aria-label="Previous month"
              className="inline-flex h-8 w-8 items-center justify-center rounded-full text-ink-muted hover:bg-surface-sunk hover:text-ink"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </Link>
            <Link
              href={`/books/${bookId}/calendar?month=${nextMonth}`}
              aria-label="Next month"
              className="inline-flex h-8 w-8 items-center justify-center rounded-full text-ink-muted hover:bg-surface-sunk hover:text-ink"
            >
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        </div>

        <table className="w-full table-fixed border-separate border-spacing-1">
          <caption className="sr-only">
            Days in {formatMonthYear(from)}. Select a day to read it or write on it.
          </caption>
          <thead>
            <tr>
              {WEEKDAYS.map((weekday) => (
                <th
                  key={weekday}
                  scope="col"
                  className="pb-2 text-xs font-normal text-ink-muted"
                  abbr={weekday}
                >
                  <span aria-hidden="true">{weekday.slice(0, 1)}</span>
                  <span className="sr-only">{weekday}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: Math.ceil((leadingBlanks + total) / 7) }, (_, week) => (
              <tr key={week}>
                {Array.from({ length: 7 }, (_, weekday) => {
                  const dayNumber = week * 7 + weekday - leadingBlanks + 1;
                  if (dayNumber < 1 || dayNumber > total) {
                    return <td key={weekday} className="p-0" />;
                  }

                  const cellDate =
                    `${from.slice(0, 7)}-${String(dayNumber).padStart(2, "0")}` as CalendarDate;
                  const entry = byDate.get(cellDate);
                  const isToday = cellDate === book.today;
                  const isSelected = cellDate === selected;

                  return (
                    <td key={weekday} className="p-0">
                      <Link
                        href={`/books/${bookId}/calendar?month=${from.slice(0, 7)}&date=${cellDate}#day`}
                        aria-current={isSelected ? "date" : undefined}
                        aria-label={`${formatLongDate(cellDate)}${
                          entry ? `, ${entry.entryCount} written` : ", nothing written"
                        }`}
                        className={cn(
                          // A real, comfortably tappable target on every day —
                          // not only the ones that already have writing.
                          "flex aspect-square flex-col items-center justify-center gap-1 rounded-lg border text-sm transition-colors",
                          isSelected
                            ? "border-ink bg-ink text-paper"
                            : entry
                              ? "border-rule-strong bg-surface font-medium text-ink hover:border-ink"
                              : "border-transparent text-ink-muted hover:border-rule-strong hover:bg-surface",
                          isToday && !isSelected && "ring-1 ring-brand",
                        )}
                      >
                        <span>{dayNumber}</span>

                        {/* Contributor dots. The count is also given to screen
                            readers above, so colour is never the only signal. */}
                        <span className="flex h-1 gap-0.5" aria-hidden="true">
                          {entry
                            ? entry.authorIds.slice(0, 3).map((authorId) => {
                                const accent = getAccent(memberMap.get(authorId)?.accent);
                                return (
                                  <span
                                    key={authorId}
                                    className="h-1 w-1 rounded-full"
                                    style={{
                                      backgroundColor: isSelected
                                        ? "currentColor"
                                        : `light-dark(${accent.light}, ${accent.dark})`,
                                    }}
                                  />
                                );
                              })
                            : null}
                        </span>
                      </Link>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>

        <p className="mt-4 text-xs text-ink-muted">
          Days with a mark have writing on them. Pick any day to read it, add to it, or start it.
        </p>
      </section>

      <section id="day" className="scroll-mt-24 space-y-6">
        <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-rule pb-4">
          <h2 className="font-serif text-xl text-ink">{formatLongDate(selected)}</h2>

          <div className="flex flex-wrap items-center gap-2">
            {dayEntries.length > 0 ? (
              <ButtonLink
                variant="ghost"
                size="sm"
                href={`/books/${bookId}/read#day-${selected}`}
              >
                <BookOpen className="h-4 w-4" aria-hidden="true" />
                Read in the book
              </ButtonLink>
            ) : null}

            {book.canWrite ? (
              <ButtonLink
                variant={dayEntries.length > 0 ? "secondary" : "primary"}
                size="sm"
                href={`/books/${bookId}/write?date=${selected}`}
              >
                <PenLine className="h-4 w-4" aria-hidden="true" />
                {dayEntries.length > 0 ? "Add another" : "Write on this day"}
              </ButtonLink>
            ) : null}
          </div>
        </div>

        {dayEntries.length === 0 ? (
          <p className="text-sm text-ink-muted">
            Nothing was written on this day
            {book.canWrite ? " — it is not too late to write it now." : "."}
          </p>
        ) : (
          <BookSurface design={book.resolvedDesign} members={members} className="space-y-12">
            {dayEntries.map((entry, index) => (
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
                  dayEntries.length > 1
                    ? { isFirst: index === 0, isLast: index === dayEntries.length - 1 }
                    : undefined
                }
              />
            ))}
          </BookSurface>
        )}
      </section>
    </div>
  );
}

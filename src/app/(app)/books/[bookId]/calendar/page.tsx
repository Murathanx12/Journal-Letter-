import { ChevronLeft, ChevronRight, PenLine } from "lucide-react";
import Link from "next/link";

import { BookSurface } from "@/components/book/book-surface";
import { DayHeading } from "@/components/book/day-heading";
import { EntryBlock } from "@/components/book/entry-block";
import { ButtonLink } from "@/components/ui/button";
import { getSessionUser } from "@/lib/auth/session";
import { getBook, getBookMembers } from "@/lib/books/queries";
import {
  addMonths,
  daysInMonth,
  endOfMonth,
  formatMonthYear,
  isCalendarDate,
  startOfMonth,
  weekdayIndexMondayFirst,
  type CalendarDate,
} from "@/lib/date/calendar-date";
import { getAccent } from "@/lib/design/theme";
import {
  getCalendar,
  getEntriesForDate,
  getFavorites,
  signEntryMedia,
} from "@/lib/entries/queries";
import { cn } from "@/lib/utils/cn";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

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
    month && isCalendarDate(`${month}-01`) ? (`${month}-01` as CalendarDate) : startOfMonth(book.today);

  const from = startOfMonth(anchor);
  const to = endOfMonth(anchor);

  const selected = date && isCalendarDate(date) ? (date as CalendarDate) : null;

  const [days, dayEntries, favorites] = await Promise.all([
    getCalendar(bookId, from, to),
    selected ? getEntriesForDate(bookId, selected) : Promise.resolve([]),
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
    <div className="space-y-10">
      <div className="flex items-center justify-between gap-4">
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
          Days with writing in {formatMonthYear(from)}. Select a day to read it.
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

                const cellDate = `${from.slice(0, 7)}-${String(dayNumber).padStart(2, "0")}` as CalendarDate;
                const entry = byDate.get(cellDate);
                const isToday = cellDate === book.today;
                const isSelected = cellDate === selected;

                return (
                  <td key={weekday} className="p-0">
                    <Link
                      href={`/books/${bookId}/calendar?month=${from.slice(0, 7)}&date=${cellDate}`}
                      aria-current={isSelected ? "date" : undefined}
                      className={cn(
                        "flex aspect-square flex-col items-center justify-center gap-1 rounded-lg border text-sm transition-colors",
                        isSelected
                          ? "border-ink bg-ink text-paper"
                          : entry
                            ? "border-rule-strong bg-surface text-ink hover:bg-surface-sunk"
                            : "border-transparent text-ink-muted hover:bg-surface-sunk",
                        isToday && !isSelected && "ring-1 ring-brand",
                      )}
                    >
                      <span>{dayNumber}</span>

                      {/* Contributor dots. The count is also given to screen
                          readers below, so colour is never the only signal. */}
                      {entry ? (
                        <span className="flex gap-0.5" aria-hidden="true">
                          {entry.authorIds.slice(0, 3).map((authorId) => {
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
                          })}
                        </span>
                      ) : null}

                      {entry ? (
                        <span className="sr-only">
                          {entry.entryCount} {entry.entryCount === 1 ? "entry" : "entries"}
                        </span>
                      ) : null}
                    </Link>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      {selected ? (
        <section className="space-y-8 border-t border-rule pt-8">
          {dayEntries.length === 0 ? (
            <div className="space-y-4 text-center">
              <p className="text-sm text-ink-muted">Nothing was written on this day.</p>
              {book.canWrite ? (
                <ButtonLink variant="secondary" href={`/books/${bookId}/write?date=${selected}`}>
                  <PenLine className="h-4 w-4" aria-hidden="true" />
                  Write an entry for this date
                </ButtonLink>
              ) : null}
            </div>
          ) : (
            <BookSurface design={book.resolvedDesign} members={members} className="space-y-8">
              <DayHeading date={selected} preset={book.resolvedDesign.preset} />
              <div className="space-y-12">
                {dayEntries.map((entry) => (
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
              </div>
            </BookSurface>
          )}
        </section>
      ) : null}
    </div>
  );
}

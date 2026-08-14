import Link from "next/link";

import type { OnThisDayHit } from "@/lib/entries/queries";
import { formatLongDate, yearsBetween, type CalendarDate } from "@/lib/date/calendar-date";

/**
 * "One year ago today."
 *
 * Kept small and quiet on purpose — it is a nudge to look back, not a feed. It
 * only ever appears when there is genuinely something from an earlier year.
 */
export function OnThisDay({
  hits,
  bookTitles,
  today,
}: {
  hits: OnThisDayHit[];
  bookTitles: Map<string, string>;
  /** Passed in, because the server's own clock is in the wrong timezone. */
  today: CalendarDate;
}) {
  return (
    <section
      aria-labelledby="on-this-day-heading"
      className="rounded-card border border-rule bg-surface-sunk/50 p-5"
    >
      <h2
        id="on-this-day-heading"
        className="text-xs tracking-[0.18em] text-ink-muted uppercase"
      >
        On this day
      </h2>

      <ul className="mt-4 space-y-4">
        {hits.slice(0, 3).map((hit) => {
          const years = yearsBetween(hit.entryDate, today);
          return (
            <li key={hit.id}>
              <Link
                href={`/books/${hit.bookId}/entries/${hit.id}`}
                className="group block rounded-lg"
              >
                <p className="text-xs text-ink-muted">
                  {years === 1 ? "One year ago" : `${years} years ago`} ·{" "}
                  {formatLongDate(hit.entryDate)}
                  {bookTitles.has(hit.bookId) ? ` · ${bookTitles.get(hit.bookId)}` : ""}
                </p>
                <p className="mt-1 line-clamp-2 font-serif text-sm leading-relaxed text-ink-soft group-hover:text-ink">
                  {hit.title ? <span className="font-medium">{hit.title}. </span> : null}
                  {hit.excerpt}
                </p>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

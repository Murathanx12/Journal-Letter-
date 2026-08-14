import { Search } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/form";
import { EmptyState } from "@/components/ui/surface";
import { getBook, getBookMembers } from "@/lib/books/queries";
import { formatLongDate, isCalendarDate, type CalendarDate } from "@/lib/date/calendar-date";
import { searchEntries } from "@/lib/entries/queries";

/**
 * Search inside one book.
 *
 * A plain GET form, so a search is a real URL that can be bookmarked, shared
 * between the two people in a book, or reloaded — and it works with JavaScript
 * disabled.
 */
export default async function SearchPage({
  params,
  searchParams,
}: {
  params: Promise<{ bookId: string }>;
  searchParams: Promise<{ q?: string; author?: string; from?: string; to?: string; tag?: string }>;
}) {
  const { bookId } = await params;
  const query = await searchParams;

  const [book, members] = await Promise.all([getBook(bookId), getBookMembers(bookId)]);
  const memberMap = new Map(members.map((member) => [member.userId, member]));

  const term = (query.q ?? "").trim();
  const from = query.from && isCalendarDate(query.from) ? (query.from as CalendarDate) : undefined;
  const to = query.to && isCalendarDate(query.to) ? (query.to as CalendarDate) : undefined;
  const authorId = query.author && memberMap.has(query.author) ? query.author : undefined;
  const tag = query.tag?.trim() || undefined;

  const hasQuery = Boolean(term || authorId || from || to || tag);
  const results = hasQuery
    ? await searchEntries(term, { bookId, authorId, from, to, tag }, 100)
    : [];

  return (
    <div className="space-y-8">
      <form method="get" className="space-y-4">
        <Field label="Search this book" htmlFor="q">
          <Input
            id="q"
            name="q"
            defaultValue={term}
            placeholder="Victoria Harbour"
            // Autofocus is right here: arriving on a search page means searching.
            autoFocus
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-4">
          <Field label="Written by" htmlFor="author">
            <Select id="author" name="author" defaultValue={authorId ?? ""}>
              <option value="">Anyone</option>
              {members.map((member) => (
                <option key={member.userId} value={member.userId}>
                  {member.displayName}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="From" htmlFor="from">
            <Input id="from" name="from" type="date" defaultValue={from ?? ""} />
          </Field>

          <Field label="To" htmlFor="to">
            <Input id="to" name="to" type="date" defaultValue={to ?? ""} />
          </Field>

          <Field label="Tag" htmlFor="tag">
            <Input id="tag" name="tag" defaultValue={tag ?? ""} placeholder="travel" />
          </Field>
        </div>

        <div className="flex items-center gap-3">
          <Button type="submit">
            <Search className="h-4 w-4" aria-hidden="true" />
            Search
          </Button>
          {hasQuery ? (
            <Link href={`/books/${bookId}/search`} className="text-sm text-ink-muted hover:text-ink">
              Clear
            </Link>
          ) : null}
        </div>
      </form>

      {hasQuery ? (
        results.length === 0 ? (
          <EmptyState
            icon={<Search className="h-7 w-7" aria-hidden="true" />}
            title="Nothing found"
            description="Try fewer words, or widen the dates."
          />
        ) : (
          <section className="space-y-1">
            <p className="text-sm text-ink-muted" aria-live="polite">
              {results.length === 100
                ? "Showing the first 100 matches"
                : `${results.length} ${results.length === 1 ? "match" : "matches"}`}
            </p>

            <ul className="divide-y divide-rule">
              {results.map((hit) => (
                <li key={hit.id}>
                  <Link
                    href={`/books/${bookId}/entries/${hit.id}`}
                    className="block py-4 transition-colors hover:bg-surface-sunk/50"
                  >
                    <p className="flex flex-wrap items-baseline gap-x-2 text-xs text-ink-muted">
                      <span>{formatLongDate(hit.entryDate)}</span>
                      <span aria-hidden="true">·</span>
                      <span>{memberMap.get(hit.authorId)?.displayName ?? "A writer"}</span>
                    </p>
                    {hit.title ? (
                      <p className="mt-1 font-serif text-base text-ink">{hit.title}</p>
                    ) : null}
                    <p className="mt-1 font-serif text-sm leading-relaxed text-ink-soft">
                      {hit.snippet}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )
      ) : (
        <p className="text-sm text-ink-muted">
          Search every entry in {book.title} by words, writer, date or tag.
        </p>
      )}
    </div>
  );
}

import { BookOpen, Library, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { BookCover } from "@/components/book/book-cover";
import { OnThisDay } from "@/components/book/on-this-day";
import { ButtonLink } from "@/components/ui/button";
import { Badge, EmptyState, PageHeader } from "@/components/ui/surface";
import { getSessionUser } from "@/lib/auth/session";
import { getLibrary, type LibraryBook } from "@/lib/books/queries";
import { formatShortDate, todayIn } from "@/lib/date/calendar-date";
import { getOnThisDay } from "@/lib/entries/queries";

export const metadata: Metadata = { title: "Your library" };

function BookCard({ book }: { book: LibraryBook }) {
  return (
    <li>
      <Link
        href={`/books/${book.id}`}
        className="group block rounded-card focus-visible:outline-2 focus-visible:outline-offset-4"
      >
        <BookCover
          title={book.title}
          subtitle={book.subtitle}
          cover={book.cover}
          designPreset={book.design.preset}
          className="shadow-sm transition-shadow group-hover:shadow-md"
        />

        <div className="mt-3 space-y-1">
          <div className="flex items-start justify-between gap-2">
            <h2 className="font-serif text-base leading-snug text-ink">{book.title}</h2>
            {book.archivedAt ? <Badge>Archived</Badge> : null}
          </div>

          <p className="text-xs text-ink-muted">
            {book.type === "shared_letter_book"
              ? `Shared · ${book.memberCount} ${book.memberCount === 1 ? "writer" : "writers"}`
              : "Personal journal"}
          </p>

          <p className="text-xs text-ink-muted">
            {book.entryCount === 0
              ? "Nothing written yet"
              : `${book.entryCount.toLocaleString()} ${book.entryCount === 1 ? "entry" : "entries"}${
                  book.lastEntryDate ? ` · last on ${formatShortDate(book.lastEntryDate)}` : ""
                }`}
          </p>
        </div>
      </Link>
    </li>
  );
}

export default async function LibraryPage() {
  const user = await getSessionUser();
  const books = await getLibrary();

  const active = books.filter((book) => !book.archivedAt);
  const archived = books.filter((book) => book.archivedAt);

  // This runs on the server, where `Intl` resolves to the *server's* timezone
  // (UTC on Vercel) rather than the reader's — which would date "on this day"
  // wrongly for anyone east or west of it. The books carry the timezones the
  // writing actually happens in, so use the most recently touched one.
  const timezone = books[0]?.timezone ?? "UTC";
  const today = todayIn(timezone);
  const onThisDay = await getOnThisDay(today);

  const bookTitles = new Map(books.map((book) => [book.id, book.title]));

  return (
    <div className="space-y-10">
      <PageHeader
        title={`Good to see you, ${user?.profile.display_name ?? "friend"}`}
        description={
          books.length === 0
            ? "Your shelf is empty for now."
            : `${books.length} ${books.length === 1 ? "book" : "books"} on your shelf.`
        }
        actions={
          <ButtonLink href="/books/new">
            <Plus className="h-4 w-4" aria-hidden="true" />
            New book
          </ButtonLink>
        }
      />

      {onThisDay.length > 0 ? (
        <OnThisDay hits={onThisDay} bookTitles={bookTitles} today={today} />
      ) : null}

      {active.length === 0 ? (
        <EmptyState
          icon={<Library className="h-8 w-8" aria-hidden="true" />}
          title="Start your first book"
          description="A private journal for yourself, or a shared letter book with someone you write to. You can always create more later."
          action={
            <ButtonLink href="/books/new">
              <Plus className="h-4 w-4" aria-hidden="true" />
              Create a book
            </ButtonLink>
          }
        />
      ) : (
        <ul className="grid grid-cols-2 gap-x-5 gap-y-8 sm:grid-cols-3 lg:grid-cols-4">
          {active.map((book) => (
            <BookCard key={book.id} book={book} />
          ))}
        </ul>
      )}

      {archived.length > 0 ? (
        <section className="space-y-4">
          <h2 className="flex items-center gap-2 font-serif text-lg text-ink-muted">
            <BookOpen className="h-4 w-4" aria-hidden="true" />
            Archived
          </h2>
          <ul className="grid grid-cols-2 gap-x-5 gap-y-8 opacity-70 sm:grid-cols-3 lg:grid-cols-4">
            {archived.map((book) => (
              <BookCard key={book.id} book={book} />
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

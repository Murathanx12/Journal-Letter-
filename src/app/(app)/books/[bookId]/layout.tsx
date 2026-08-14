import type { Metadata } from "next";

import { BookNav } from "@/components/book/book-nav";
import { getBook } from "@/lib/books/queries";

/**
 * Titles must not leak. A book called "Letters to my therapist" should not end
 * up in a browser history entry shared on a screen, or in a link preview, so
 * private pages get a generic title and are already `noindex` from the parent
 * layout.
 */
export const metadata: Metadata = { title: "Book" };

export default async function BookLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ bookId: string }>;
}) {
  const { bookId } = await params;

  // Membership guard for every route beneath this one. Non-members get a 404,
  // which tells them nothing about whether the book exists.
  const book = await getBook(bookId);

  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <div className="space-y-1">
          <h1 className="font-serif text-2xl leading-tight text-ink sm:text-3xl">{book.title}</h1>
          {book.subtitle ? <p className="text-sm text-ink-muted">{book.subtitle}</p> : null}
        </div>

        <BookNav
          bookId={book.id}
          isShared={book.type === "shared_letter_book"}
          isOwner={book.isOwner}
          canWrite={book.canWrite}
        />
      </div>

      {children}
    </div>
  );
}

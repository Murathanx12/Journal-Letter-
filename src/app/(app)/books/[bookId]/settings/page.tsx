import { notFound } from "next/navigation";

import { BookSettingsForm } from "@/components/settings/book-settings-form";
import { DangerZone } from "@/components/settings/danger-zone";
import { getBook } from "@/lib/books/queries";

export default async function BookSettingsPage({
  params,
}: {
  params: Promise<{ bookId: string }>;
}) {
  const { bookId } = await params;
  const book = await getBook(bookId);

  // Settings change the book for everyone in it, so they are the owner's alone.
  if (!book.isOwner) notFound();

  return (
    <div className="max-w-2xl space-y-10">
      <BookSettingsForm
        bookId={book.id}
        title={book.title}
        subtitle={book.subtitle}
        description={book.description}
        timezone={book.timezone}
        cover={book.cover}
        design={book.design}
      />

      <DangerZone
        bookId={book.id}
        title={book.title}
        isArchived={Boolean(book.archivedAt)}
        type={book.type}
      />
    </div>
  );
}

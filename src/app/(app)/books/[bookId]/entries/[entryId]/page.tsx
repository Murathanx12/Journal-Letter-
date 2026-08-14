import { notFound } from "next/navigation";

import { BookSurface } from "@/components/book/book-surface";
import { DayHeading } from "@/components/book/day-heading";
import { EntryBlock } from "@/components/book/entry-block";
import { RevertToOriginal } from "@/components/editor/revert-to-original";
import { EntryComposer } from "@/components/editor/entry-composer";
import { getSessionUser } from "@/lib/auth/session";
import { getBook, getBookMembers } from "@/lib/books/queries";
import { getEntry, getFavorites } from "@/lib/entries/queries";
import { featureFlags } from "@/lib/env";
import { asRichTextDoc } from "@/lib/text/rich-text";

export default async function EntryPage({
  params,
}: {
  params: Promise<{ bookId: string; entryId: string }>;
}) {
  const { bookId, entryId } = await params;

  const [book, entry, members, user, favorites] = await Promise.all([
    getBook(bookId),
    getEntry(bookId, entryId),
    getBookMembers(bookId),
    getSessionUser(),
    getFavorites(bookId),
  ]);

  // A sealed or non-existent entry both arrive here as null, because RLS
  // withholds the row itself. Same 404 either way.
  if (!entry) notFound();

  const isAuthor = entry.authorId === user?.id;
  const author = members.find((member) => member.userId === entry.authorId);

  // Only the author edits their own words. Everyone else reads them.
  if (isAuthor && book.canWrite) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        {entry.hasOriginal ? (
          <RevertToOriginal
            bookId={bookId}
            entryId={entry.id}
            correctionState={entry.correctionState}
          />
        ) : null}

        <EntryComposer
          bookId={bookId}
          bookToday={book.today}
          entry={{
            id: entry.id,
            entryDate: entry.entryDate,
            title: entry.title,
            content: asRichTextDoc(entry.content),
            status: entry.status,
            tags: entry.tags,
            sealedUntil: entry.sealedUntil,
            hasOriginal: entry.hasOriginal,
            correctionState: entry.correctionState,
          }}
          aiAvailable={featureFlags.aiProofreading}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <BookSurface design={book.resolvedDesign} members={members} className="space-y-8">
        <DayHeading date={entry.entryDate} preset={book.resolvedDesign.preset} />
        <EntryBlock
          entry={entry}
          author={author}
          design={book.resolvedDesign}
          bookId={bookId}
          canEdit={false}
          isFavorite={favorites.has(entry.id)}
        />
      </BookSurface>
    </div>
  );
}

import { notFound } from "next/navigation";

import { BookPages } from "@/components/book/book-pages";
import { BookSurface } from "@/components/book/book-surface";
import { DayHeading } from "@/components/book/day-heading";
import { EntryBlock } from "@/components/book/entry-block";
import { RevertToOriginal } from "@/components/editor/revert-to-original";
import { EntryComposer } from "@/components/editor/entry-composer";
import { getSessionUser } from "@/lib/auth/session";
import { getBook, getBookMembers } from "@/lib/books/queries";
import {
  getEntry,
  getEntryAttachments,
  getFavorites,
  signEntryMedia,
} from "@/lib/entries/queries";
import { PAGE_HEIGHT } from "@/lib/design/pages";
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
    // Photographs already uploaded against this entry, plus anything placed on
    // the page, so the arranger can render them without a round trip.
    const attachments = await getEntryAttachments(bookId, entry.id);
    const placed = await signEntryMedia([entry]);
    const mediaUrls: Record<string, string> = Object.fromEntries(placed);
    for (const attachment of attachments) {
      if (attachment.url) mediaUrls[attachment.path] = attachment.url;
    }

    return (
      <div className="mx-auto max-w-5xl space-y-6">
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
            layout: entry.layout,
          }}
          initialMediaUrls={mediaUrls}
          indentParagraphs={book.resolvedDesign.preset.indentParagraphs}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl">
      <BookSurface design={book.resolvedDesign} members={members}>
        <BookPages pageHeight={PAGE_HEIGHT} label="This entry, page by page">
          <DayHeading
            date={entry.entryDate}
            preset={book.resolvedDesign.preset}
            className="mb-7"
          />
          <EntryBlock
            entry={entry}
            author={author}
            design={book.resolvedDesign}
            bookId={bookId}
            canEdit={false}
            isFavorite={favorites.has(entry.id)}
            mediaUrls={await signEntryMedia([entry])}
          />
        </BookPages>
      </BookSurface>
    </div>
  );
}

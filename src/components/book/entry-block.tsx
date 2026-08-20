import { Lock, Pencil, Star } from "lucide-react";
import Link from "next/link";

import { AuthorMark } from "@/components/book/author-mark";
import { EntryContent } from "@/components/book/entry-content";
import { EntryOrder } from "@/components/book/entry-order";
import { DrawingLayer } from "@/components/media/drawing-layer";
import { EntryMedia } from "@/components/media/media-layer";
import { splitElementsByLayer } from "@/lib/media/drawing";
import type { BookMember } from "@/lib/books/queries";
import type { CompiledEntry } from "@/lib/entries/compile";
import type { ResolvedDesign } from "@/lib/design/theme";
import { cn } from "@/lib/utils/cn";

/**
 * One entry as it appears inside the book.
 *
 * The author's name and the date are always shown, even when the writer did not
 * type them — that is the whole point of compiling loose letters into a book.
 */
export function EntryBlock({
  entry,
  author,
  design,
  bookId,
  canEdit,
  isFavorite,
  showActions = true,
  order,
  mediaUrls,
  className,
}: {
  entry: CompiledEntry;
  author: BookMember | undefined;
  design: ResolvedDesign;
  bookId: string;
  canEdit: boolean;
  isFavorite?: boolean;
  showActions?: boolean;
  /**
   * Where this letter sits among the others written the same day. Absent when
   * it is the only one — there is nothing to reorder against.
   */
  order?: { isFirst: boolean; isLast: boolean };
  /** Signed URLs keyed by storage path. Absent means "no photographs". */
  mediaUrls?: Map<string, string>;
  className?: string;
}) {
  const urls = mediaUrls ?? new Map<string, string>();
  const { behind: drawnBehind, front: drawnFront } = splitElementsByLayer(entry.drawing);

  return (
    <article className={cn("group", className)} id={`entry-${entry.id}`}>
      <header className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        {author ? (
          <AuthorMark
            author={author}
            showSignature={design.showSignatures}
            perAuthorFonts={design.perAuthorFonts}
          />
        ) : (
          <span className="text-sm text-ink-muted">A writer</span>
        )}

        {/*
          Always visible, never revealed on hover. There is no hover on a phone,
          which is where most of this is written — an edit link that only appears
          under a mouse pointer may as well not exist.
        */}
        {showActions ? (
          <div className="no-print flex items-center gap-2">
            {isFavorite ? (
              <Star className="h-3.5 w-3.5 fill-current text-brand" aria-label="A favourite" />
            ) : null}
            {order && canEdit ? (
              <EntryOrder
                bookId={bookId}
                entryId={entry.id}
                isFirst={order.isFirst}
                isLast={order.isLast}
              />
            ) : null}
            {canEdit ? (
              <Link
                href={`/books/${bookId}/entries/${entry.id}`}
                className="inline-flex items-center gap-1 rounded-full border border-rule px-2.5 py-1 text-xs text-ink-muted transition-colors hover:border-rule-strong hover:text-ink"
              >
                <Pencil className="h-3 w-3" aria-hidden="true" />
                Edit
              </Link>
            ) : null}
          </div>
        ) : null}
      </header>

      {entry.title ? (
        // Size and weight come from the book's own design, not from a utility
        // class, so "make the titles bigger" is a setting the reader can change
        // rather than something only a developer can.
        <h3
          className="mb-2 text-ink"
          style={{
            fontFamily: "var(--book-heading-font)",
            fontSize: `calc(var(--book-base-size, 18px) * ${design.titleSize})`,
            fontWeight: design.titleWeight,
            lineHeight: 1.25,
          }}
        >
          {entry.title}
        </h3>
      ) : null}

      <div
        className="book-prose"
        data-indent={design.preset.indentParagraphs ? "true" : "false"}
        // Each writer's own typeface, when the book asks for it. Size and
        // leading stay the book's, so the page still looks like one book.
        style={
          design.perAuthorFonts && author
            ? { fontFamily: `var(--author-font-${author.userId}, var(--book-body-font))` }
            : undefined
        }
      >
        <EntryMedia items={entry.layout} urls={urls}>
          {/*
            Under the writing, and over it. This is the whole of "does the text
            stay on top?": a circle drawn round a paragraph goes behind, and a
            note scribbled across one goes in front.

            Both come before the writing, and `z-index` decides what covers
            what — an anchor placed after the text would be positioned from
            whichever page the text ended on. See `EntryMedia`.
          */}
          <DrawingLayer elements={drawnBehind} className="z-0" />
          <DrawingLayer elements={drawnFront} className="z-30" />
          <EntryContent content={entry.content} mediaUrls={urls} />
        </EntryMedia>
      </div>

      {entry.correctionState !== "original" ? (
        <p className="mt-3 text-xs text-ink-muted italic">
          Lightly corrected. The original wording is kept and can be restored.
        </p>
      ) : null}

      {entry.tags.length > 0 ? (
        <ul className="mt-3 flex flex-wrap gap-1.5">
          {entry.tags.map((tag) => (
            <li key={tag} className="rounded-full border border-rule px-2 py-0.5 text-xs text-ink-muted">
              {tag}
            </li>
          ))}
        </ul>
      ) : null}
    </article>
  );
}

/**
 * A sealed letter's placeholder.
 *
 * The content is not merely hidden in the interface — the row itself is
 * withheld by an RLS policy, and this metadata comes from a function that
 * cannot return the text at all.
 */
export function SealedEntryBlock({
  author,
  opensOn,
  className,
}: {
  author: BookMember | undefined;
  opensOn: string;
  className?: string;
}) {
  return (
    <article
      className={cn(
        "rounded-card border border-dashed border-rule-strong px-5 py-6 text-center",
        className,
      )}
    >
      <Lock className="mx-auto h-4 w-4 text-ink-muted" aria-hidden="true" />
      <p className="mt-2 text-sm text-ink-soft">
        A sealed letter from {author?.displayName ?? "a writer"}
      </p>
      <p className="mt-1 text-xs text-ink-muted">It opens on {opensOn}.</p>
    </article>
  );
}

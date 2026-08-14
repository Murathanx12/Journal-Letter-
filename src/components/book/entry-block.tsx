import { Lock, Pencil, Star } from "lucide-react";
import Link from "next/link";

import { AuthorMark } from "@/components/book/author-mark";
import { EntryContent } from "@/components/book/entry-content";
import { MediaLayer, WrappedMedia } from "@/components/media/media-layer";
import type { BookMember } from "@/lib/books/queries";
import type { CompiledEntry } from "@/lib/entries/compile";
import type { ResolvedDesign } from "@/lib/design/theme";
import { splitByLayer } from "@/lib/media/placement";
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
  /** Signed URLs keyed by storage path. Absent means "no photographs". */
  mediaUrls?: Map<string, string>;
  className?: string;
}) {
  const urls = mediaUrls ?? new Map<string, string>();
  const { behind, front, wrapped } = splitByLayer(entry.layout);
  const hasMedia = entry.layout.length > 0;

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

        {showActions ? (
          <div className="flex items-center gap-2 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
            {isFavorite ? (
              <Star
                className="h-3.5 w-3.5 fill-current text-brand opacity-100"
                aria-label="A favourite"
              />
            ) : null}
            {canEdit ? (
              <Link
                href={`/books/${bookId}/entries/${entry.id}`}
                className="inline-flex items-center gap-1 text-xs text-ink-muted hover:text-ink"
              >
                <Pencil className="h-3 w-3" aria-hidden="true" />
                Edit
              </Link>
            ) : null}
          </div>
        ) : null}
      </header>

      {entry.title ? (
        <h3
          className="mb-2 text-lg text-ink"
          style={{ fontFamily: "var(--book-heading-font)" }}
        >
          {entry.title}
        </h3>
      ) : null}

      {/*
        The page.

        `container-type: inline-size` is what lets every placed photograph be
        positioned in fractions of the column width — including vertically.
        Without it a page arranged today would rearrange itself as soon as
        somebody wrote another sentence.
      */}
      <div className={cn(hasMedia && "relative [container-type:inline-size]")}>
        {hasMedia ? <MediaLayer items={behind} urls={urls} className="z-0" /> : null}

        <div
          className={cn("book-prose", hasMedia && "relative z-10")}
          data-indent={design.preset.indentParagraphs ? "true" : "false"}
          // Each writer's own typeface, when the book asks for it. Size and
          // leading stay the book's, so the page still looks like one book.
          style={
            design.perAuthorFonts && author
              ? { fontFamily: `var(--author-font-${author.userId}, var(--book-body-font))` }
              : undefined
          }
        >
          {/*
            Floats come first so the text that follows flows around them. Their
            `shape-outside` matches the cut-out, so the writing hugs the
            silhouette rather than a box.
          */}
          {wrapped.map((item) => (
            <WrappedMedia key={item.id} item={item} url={urls.get(item.path)} />
          ))}

          <EntryContent content={entry.content} />
        </div>

        {hasMedia ? <MediaLayer items={front} urls={urls} className="z-20" /> : null}
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
}: {
  author: BookMember | undefined;
  opensOn: string;
}) {
  return (
    <article className="rounded-card border border-dashed border-rule-strong px-5 py-6 text-center">
      <Lock className="mx-auto h-4 w-4 text-ink-muted" aria-hidden="true" />
      <p className="mt-2 text-sm text-ink-soft">
        A sealed letter from {author?.displayName ?? "a writer"}
      </p>
      <p className="mt-1 text-xs text-ink-muted">It opens on {opensOn}.</p>
    </article>
  );
}

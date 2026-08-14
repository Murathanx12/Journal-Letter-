import { BookSurface } from "@/components/book/book-surface";
import { DayHeading } from "@/components/book/day-heading";
import { EntryContent } from "@/components/book/entry-content";
import type { Book, BookMember } from "@/lib/books/queries";
import { getBookDays } from "@/lib/entries/queries";
import { cn } from "@/lib/utils/cn";

const PAGE_RATIOS: Record<string, string> = {
  A4: "1 / 1.414",
  A5: "1 / 1.414",
  LETTER: "1 / 1.294",
  DIGEST: "1 / 1.545",
};

/**
 * Print preview.
 *
 * A faithful-enough impression of the first printed pages: the real title page,
 * the real chapter dates, the book's own typography, at the correct page
 * proportions. It is not a pixel-exact render of the PDF — producing that would
 * mean generating the PDF on every keystroke — but it answers the question
 * somebody actually has before they commit to printing, which is "will this
 * look like a book?".
 */
export async function PrintPreview({ book, members }: { book: Book; members: BookMember[] }) {
  const page = await getBookDays(book.id, { dayLimit: 2 });
  const memberMap = new Map(members.map((member) => [member.userId, member]));
  const ratio = PAGE_RATIOS[book.resolvedDesign.pageSize] ?? "1 / 1.414";

  const cover = book.cover;

  return (
    <div className="space-y-4">
      <h2 className="text-sm font-medium text-ink-soft">Preview</h2>

      <div className="grid gap-6 sm:grid-cols-2">
        {/* Title page */}
        <div
          className="flex flex-col items-center justify-center rounded-sm border border-rule bg-white px-8 text-center shadow-sm"
          style={{ aspectRatio: ratio }}
        >
          <p
            className="text-lg leading-tight text-balance text-[#1a1a1a]"
            style={{ fontFamily: "var(--book-heading-font)" }}
          >
            {book.title}
          </p>
          {book.subtitle ? (
            <p className="mt-2 text-[11px] text-[#4a4a4a]">{book.subtitle}</p>
          ) : null}
          <span className="my-4 h-px w-12 bg-[#8a8a8a]" aria-hidden="true" />
          <p className="text-[9px] tracking-[0.18em] text-[#3a3a3a] uppercase">
            {members.map((member) => member.displayName).join(" · ")}
          </p>
        </div>

        {/* First page of text */}
        <div
          className="overflow-hidden rounded-sm border border-rule bg-white px-7 py-6 shadow-sm"
          style={{ aspectRatio: ratio }}
        >
          <BookSurface design={book.resolvedDesign} members={members}>
            <div className="origin-top scale-[0.72] space-y-4 text-[#1a1a1a]">
              {page.days.slice(0, 1).map((day) => (
                <div key={day.date} className="space-y-3">
                  <DayHeading date={day.date} preset={book.resolvedDesign.preset} />
                  {day.entries.slice(0, 2).map((entry) => (
                    <div key={entry.id} className="space-y-1">
                      <p className="text-[11px] text-[#5a5a5a]">
                        {memberMap.get(entry.authorId)?.displayName ?? "A writer"}
                      </p>
                      <div
                        className={cn("book-prose max-w-none text-[#1a1a1a]")}
                        data-indent={book.resolvedDesign.preset.indentParagraphs ? "true" : "false"}
                      >
                        <EntryContent content={entry.content} />
                      </div>
                    </div>
                  ))}
                </div>
              ))}

              {page.days.length === 0 ? (
                <p className="text-center text-xs text-[#8a8a8a]">
                  Once there are entries, they will appear here.
                </p>
              ) : null}
            </div>
          </BookSurface>
        </div>
      </div>

      <p className="text-xs text-ink-muted">
        {book.resolvedDesign.preset.label} · {book.resolvedDesign.pageSize} ·{" "}
        {book.resolvedDesign.bodyFont.label} at {book.resolvedDesign.baseSize}px on screen. Change
        any of this in the book&rsquo;s settings.
        {cover.imagePath ? " Your uploaded cover is used on the shelf, not inside the file." : ""}
      </p>
    </div>
  );
}

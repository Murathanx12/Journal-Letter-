"use client";

import { Printer } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { DayHeading } from "@/components/book/day-heading";
import { EntryBlock } from "@/components/book/entry-block";
import { contentBox, getPaper, pageRule } from "@/lib/design/paper";
import type { ResolvedDesign } from "@/lib/design/theme";
import type { BookMember } from "@/lib/books/queries";
import type { BookDay } from "@/lib/entries/compile";

/**
 * Printing the book with its real pages.
 *
 * The ordinary browser print of a web page throws the book's pagination away
 * and lets the printer break the text wherever it lands. That is fine for the
 * words and useless for everything placed *on a page*: a photograph pinned a
 * third of the way down page four, or a circle drawn round a paragraph, are
 * stored as fractions of a page, and without pages those fractions mean
 * nothing. So they used to be dropped.
 *
 * This prints the book the way it is read: one sheet per page.
 *
 * The trick is that the browser is asked to fragment the text exactly once, at
 * the size of the paper, and each sheet is then a *window* onto one column of
 * that single layout:
 *
 *   ┌ sheet 3 ────────────┐
 *   │ ┌ window (clipped) ─┐│      the same multi-column box, slid left by
 *   │ │  [col0][col1][col2]│      three page widths, so column three is what
 *   │ └───────────────────┘│      shows through
 *   └─────────────────────┘
 *
 * Because every sheet holds the same layout, and photographs and drawings are
 * positioned against that layout by the same CSS as on screen, everything lands
 * exactly where it was put. Nothing has to be re-measured or re-derived, and
 * the print cannot drift out of step with the book.
 *
 * The cost is that an entry's markup is repeated once per page it occupies —
 * typically two or three times. That is per entry, not per book, so a long book
 * costs about twice its own size rather than the square of it.
 *
 * Every entry starts on a fresh page, so a letter that ends a third of the way
 * down leaves the rest of that sheet blank. That is how a printed book of
 * letters should look, and it is what makes one-sheet-per-page affordable at
 * all.
 */

export function PrintedBook({
  days,
  members,
  design,
  bookId,
  mediaUrls,
}: {
  days: BookDay[];
  members: BookMember[];
  design: ResolvedDesign;
  bookId: string;
  mediaUrls: Map<string, string>;
}) {
  const paper = getPaper(design.pageSize);
  const box = contentBox(paper);

  const [preparing, setPreparing] = useState(false);
  const [ready, setReady] = useState(false);

  const memberMap = new Map(members.map((member) => [member.userId, member]));

  /** Every entry, with the day heading that opens its day. */
  const leaves = days.flatMap((day) =>
    day.entries.map((entry, index) => ({
      key: entry.id,
      date: index === 0 ? day.date : null,
      entry,
    })),
  );

  /** How many pages each entry turned out to need, once measured. */
  const [pageCounts, setPageCounts] = useState<Record<string, number>>({});
  const measured = useRef(false);

  const print = useCallback(() => {
    measured.current = false;
    setPageCounts({});
    setReady(false);
    setPreparing(true);
  }, []);

  // Measure once the print copy is in the document. `useLayoutEffect` so the
  // reading is taken before the browser paints, and nothing flashes.
  useLayoutEffect(() => {
    if (!preparing || measured.current) return;

    const counts: Record<string, number> = {};
    for (const leaf of leaves) {
      const element = document.getElementById(`measure-${leaf.key}`);
      if (!element) continue;
      // The final column has no trailing gap; column-gap is zero here anyway,
      // which is what makes one page exactly one column width.
      const pages = Math.max(1, Math.round(element.scrollWidth / element.clientWidth));
      counts[leaf.key] = Math.min(pages, 200);
    }

    measured.current = true;
    setPageCounts(counts);
    setReady(true);
  }, [preparing, leaves]);

  // Once the sheets exist, print — then put everything away again.
  useEffect(() => {
    if (!preparing || !ready) return;

    const done = () => {
      setPreparing(false);
      setReady(false);
    };

    window.addEventListener("afterprint", done, { once: true });
    // A frame, so the sheets have actually been painted before the dialogue
    // freezes the page.
    const frame = requestAnimationFrame(() => window.print());

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("afterprint", done);
    };
  }, [preparing, ready]);

  const style = {
    "--paper-w": `${paper.width}mm`,
    "--paper-h": `${paper.height}mm`,
    "--paper-margin": `${paper.margin}mm`,
    // What "the page" means to a photograph or a drawing on these sheets.
    "--page-height": `${box.height}mm`,
    "--page-gap": "0px",
  } as React.CSSProperties;

  function content(leaf: (typeof leaves)[number]): ReactNode {
    return (
      <>
        {leaf.date ? (
          <DayHeading date={leaf.date} preset={design.preset} className="mb-6" />
        ) : null}
        <EntryBlock
          entry={leaf.entry}
          author={memberMap.get(leaf.entry.authorId)}
          design={design}
          bookId={bookId}
          canEdit={false}
          showActions={false}
          mediaUrls={mediaUrls}
        />
      </>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={print}
        disabled={preparing}
        className="no-print inline-flex items-center gap-1.5 rounded-full border border-rule-strong px-3 py-1.5 text-xs text-ink-muted transition-colors hover:text-ink disabled:opacity-50"
      >
        <Printer className="h-3.5 w-3.5" aria-hidden="true" />
        {preparing ? "Preparing the pages…" : "Print with the pages"}
      </button>

      {/*
        Portalled onto `body` rather than left where the button is. The print
        stylesheet hides every top-level sibling of the printed book so the
        ordinary flowing copy does not print as well — and "sibling" only means
        anything if this is a child of `body` in the first place.
      */}
      {preparing
        ? createPortal(
        <div className="printed-book" style={style} aria-hidden="true">
          {/* The paper size has to reach `@page`, which no inline style can. */}
          <style>{pageRule(paper)}</style>

          {leaves.map((leaf) => {
            const pages = pageCounts[leaf.key];

            // Before measuring: one copy of the entry, laid out at exactly the
            // printed size. Its width is what tells us how many pages it needs.
            if (!pages) {
              return (
                <div key={leaf.key} className="printed-measure">
                  <div id={`measure-${leaf.key}`} className="printed-leaves">
                    {content(leaf)}
                  </div>
                </div>
              );
            }

            return Array.from({ length: pages }, (_, sheet) => (
              <div key={`${leaf.key}-${sheet}`} className="printed-sheet">
                <div className="printed-window">
                  <div
                    className="printed-leaves"
                    style={{ transform: `translateX(-${sheet * 100}%)` }}
                  >
                    {content(leaf)}
                  </div>
                </div>
              </div>
            ));
          })}
        </div>,
            document.body,
          )
        : null}
    </>
  );
}

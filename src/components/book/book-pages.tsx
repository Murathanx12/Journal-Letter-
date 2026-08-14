"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
  type Ref,
} from "react";

import { cn } from "@/lib/utils/cn";

/**
 * An open book: two facing pages, and a page turn to get to the next two.
 *
 * The pages are real pagination, not a decoration. The writing flows into the
 * left page, then the right page, then onto the next spread — which is what
 * makes it possible to see how a letter will actually fall on paper while it is
 * still being written.
 *
 * How it works: a multi-column box with a definite height. When the writing no
 * longer fits, the browser lays the rest out in further columns *beside* the
 * visible ones and the box becomes horizontally scrollable. Turning a page is
 * then a scroll of exactly one spread. `column-fill: auto` is the crucial part —
 * the default (`balance`) would share a short letter evenly between both pages
 * instead of filling the left one first, which is not how a book works and looks
 * wrong the moment there is only a paragraph.
 *
 * Two consequences worth knowing:
 *
 *   * `break-before: column` starts an element on a fresh page, which is how
 *     each entry gets its own opening page.
 *   * `overflow: hidden` still makes the box a scroll container. Page turns are
 *     driven entirely from here, so a stray trackpad swipe cannot leave someone
 *     looking at half of one page and half of another.
 */

export type BookPagesHandle = {
  /**
   * Turn to the spread containing this horizontal viewport coordinate.
   *
   * The editor calls this as the caret moves. The browser will already have
   * nudged the box far enough to reveal the caret, which usually leaves it
   * straddling two spreads; this lands it back on a whole one.
   */
  showColumnAt: (clientX: number) => void;
};

type Geometry = {
  /** Distance from the start of one spread to the start of the next, in px. */
  pitch: number;
  spreads: number;
  pages: number;
  /** Pages visible at once: two on a laptop, one on a phone. */
  perSpread: number;
};

const EMPTY = "0:1:1:1";

/**
 * Encoded as a string because `useSyncExternalStore` compares snapshots by
 * identity — returning a fresh object on every read would loop forever.
 */
function readGeometry(element: HTMLElement | null): string {
  if (!element) return EMPTY;

  const styles = getComputedStyle(element);
  const gap = Number.parseFloat(styles.columnGap) || 0;
  const perSpread = Math.max(1, Number.parseInt(styles.columnCount, 10) || 1);
  const width = element.clientWidth;

  // Before layout there is nothing to measure, and dividing by it would give
  // Infinity pages.
  if (width <= 0) return EMPTY;

  const pageWidth = (width - (perSpread - 1) * gap) / perSpread;
  if (pageWidth <= 0) return EMPTY;

  // The final column has no trailing gap, so add one back before dividing.
  const pages = Math.max(perSpread, Math.round((element.scrollWidth + gap) / (pageWidth + gap)));
  const spreads = Math.max(1, Math.ceil(pages / perSpread));

  return `${width + gap}:${spreads}:${pages}:${perSpread}`;
}

function parseGeometry(encoded: string): Geometry {
  const [pitch, spreads, pages, perSpread] = encoded.split(":").map(Number);
  return { pitch: pitch!, spreads: spreads!, pages: pages!, perSpread: perSpread! };
}

/**
 * The element is held in state rather than in a ref so that measuring it is an
 * ordinary reactive dependency: a ref would not say when it arrived, and reading
 * `ref.current` while rendering is not allowed.
 */
function useGeometry(element: HTMLElement | null): Geometry {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (!element) return () => {};

      // Coalesce to one measurement per frame. Typing fires a mutation for every
      // keystroke, and each measurement forces a layout.
      let frame = 0;
      const schedule = () => {
        if (frame) return;
        frame = requestAnimationFrame(() => {
          frame = 0;
          onChange();
        });
      };

      // Width changes (a rotated phone, a resized window) change the size of a
      // page; content changes change how many pages there are.
      const resize = new ResizeObserver(schedule);
      resize.observe(element);

      const mutation = new MutationObserver(schedule);
      mutation.observe(element, { childList: true, subtree: true, characterData: true });

      return () => {
        if (frame) cancelAnimationFrame(frame);
        resize.disconnect();
        mutation.disconnect();
      };
    },
    [element],
  );

  const getSnapshot = useCallback(() => readGeometry(element), [element]);
  const encoded = useSyncExternalStore(subscribe, getSnapshot, () => EMPTY);

  return useMemo(() => parseGeometry(encoded), [encoded]);
}

export function BookPages({
  children,
  ref,
  /** Height of a page. Kept in `rem` so it scales with the reader's font size. */
  pageHeight = "40rem",
  className,
  label = "Book pages",
  footer,
}: {
  children: ReactNode;
  ref?: Ref<BookPagesHandle>;
  pageHeight?: string;
  className?: string;
  label?: string;
  /** Shown beside the page numbers, for controls that belong to the book. */
  footer?: ReactNode;
}) {
  const [leaves, setLeaves] = useState<HTMLDivElement | null>(null);
  const geometry = useGeometry(leaves);
  const [spread, setSpread] = useState(0);

  // Deleting a chunk of writing can leave the reader on a spread that no longer
  // exists, so the spread on show is derived rather than trusted.
  const current = Math.min(spread, geometry.spreads - 1);

  useEffect(() => {
    if (!leaves || geometry.pitch <= 0) return;

    const target = current * geometry.pitch;
    // Without this guard, snapping to the caret's spread below would fight this
    // effect: it would scroll back to a position it is already at.
    if (Math.abs(leaves.scrollLeft - target) > 1) {
      leaves.scrollTo({ left: target, behavior: "smooth" });
    }
  }, [leaves, current, geometry.pitch]);

  useImperativeHandle(
    ref,
    () => ({
      showColumnAt(clientX) {
        if (!leaves || geometry.pitch <= 0) return;

        // Where that point sits along the whole strip of pages, independent of
        // how far the browser has already scrolled to reveal it.
        const box = leaves.getBoundingClientRect();
        const along = clientX - box.left + leaves.scrollLeft;
        const target = Math.max(0, Math.floor(along / geometry.pitch));

        // Jump rather than glide: this corrects the browser's own scroll, and
        // animating it would read as a lurch on every keystroke.
        leaves.scrollTo({ left: target * geometry.pitch, behavior: "auto" });
        setSpread(target);
      },
    }),
    [leaves, geometry.pitch],
  );

  const firstPage = current * geometry.perSpread + 1;
  const lastPage = Math.min(geometry.pages, firstPage + geometry.perSpread - 1);

  // Published to the pages themselves so a photograph can be stuck to page four,
  // a third of the way down, in nothing but CSS. See `stickerStyle`.
  const pageVars = {
    "--page-height": pageHeight,
    height: pageHeight,
  } as CSSProperties;

  return (
    <div className={cn("space-y-3", className)}>
      <div className="book-open">
        <div ref={setLeaves} className="book-open__leaves" style={pageVars} aria-label={label}>
          {children}
        </div>

        {/* The fold between the two pages. Decorative only. */}
        <span className="book-open__spine" aria-hidden="true" />
      </div>

      <div className="no-print flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-xs text-ink-muted">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setSpread(Math.max(0, current - 1))}
            disabled={current === 0}
            aria-label="Previous page"
            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-surface-sunk hover:text-ink disabled:opacity-30 disabled:hover:bg-transparent"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </button>

          <span aria-live="polite" className="tabular-nums">
            {firstPage === lastPage ? `Page ${firstPage}` : `Pages ${firstPage}–${lastPage}`}
            {` of ${geometry.pages}`}
          </span>

          <button
            type="button"
            onClick={() => setSpread(Math.min(geometry.spreads - 1, current + 1))}
            disabled={current >= geometry.spreads - 1}
            aria-label="Next page"
            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-surface-sunk hover:text-ink disabled:opacity-30 disabled:hover:bg-transparent"
          >
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {footer}
      </div>
    </div>
  );
}

/**
 * Paper.
 *
 * The printed book's page, in millimetres, so that a photograph placed a third
 * of the way down page four is a third of the way down the fourth *sheet* — not
 * a page-width off the edge, which is what happens when a screen layout is
 * simply let loose on a printer.
 *
 * These are the same trim sizes the PDF export offers, kept in one place so a
 * book cannot print at one size and export at another.
 */

export type PaperId = "A5" | "A4" | "LETTER" | "DIGEST";

export type Paper = {
  id: PaperId;
  label: string;
  /** Trim size in millimetres. */
  width: number;
  height: number;
  /** Margin on every side, in millimetres. */
  margin: number;
};

export const PAPERS: Record<PaperId, Paper> = {
  A5: { id: "A5", label: "A5", width: 148, height: 210, margin: 14 },
  // Digest, the common trim for a printed paperback: 5.5in × 8.5in.
  DIGEST: { id: "DIGEST", label: "Digest", width: 140, height: 216, margin: 14 },
  A4: { id: "A4", label: "A4", width: 210, height: 297, margin: 18 },
  LETTER: { id: "LETTER", label: "US Letter", width: 216, height: 279, margin: 18 },
};

export function getPaper(value: string | null | undefined): Paper {
  return value && value in PAPERS ? PAPERS[value as PaperId] : PAPERS.A5;
}

/** The printable area inside the margins, in millimetres. */
export function contentBox(paper: Paper): { width: number; height: number } {
  return { width: paper.width - paper.margin * 2, height: paper.height - paper.margin * 2 };
}

/**
 * What `@page` has to say for the sheets to be the right size.
 *
 * `margin: 0` because the margin is drawn inside the page box instead — the
 * page's own margin is not part of any containing block, so a photograph
 * positioned against "the page" would be measured against the wrong rectangle.
 */
export function pageRule(paper: Paper): string {
  return `@page { size: ${paper.width}mm ${paper.height}mm; margin: 0; }`;
}

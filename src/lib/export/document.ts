import type { CalendarDate } from "@/lib/date/calendar-date";
import type { ResolvedDesign } from "@/lib/design/theme";
import { asRichTextDoc, type RichTextNode } from "@/lib/text/rich-text";

/**
 * The portable document model.
 *
 * PDF, DOCX and Google Docs each want a different API, and each is easy to get
 * subtly wrong. So the book is compiled *once* into the neutral structure below,
 * and the three exporters are dumb renderers over it. If the PDF and the Word
 * file ever disagree about what the book says, the bug is here — in one place —
 * rather than in three.
 */

export type ExportRun = {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  /** Present when the run was a link; renderers may show the URL in print. */
  href?: string;
};

export type ExportBlock =
  | { type: "paragraph"; runs: ExportRun[]; align?: "left" | "center" | "right" }
  | { type: "heading"; level: 1 | 2 | 3; runs: ExportRun[] }
  | { type: "quote"; runs: ExportRun[] }
  | { type: "listItem"; ordered: boolean; runs: ExportRun[] }
  | { type: "rule" };

export type ExportEntry = {
  id: string;
  authorName: string;
  title: string | null;
  blocks: ExportBlock[];
  /** True when this entry is being printed in its corrected form. */
  corrected: boolean;
};

export type ExportDay = {
  date: CalendarDate;
  entries: ExportEntry[];
};

export type ExportDocument = {
  title: string;
  subtitle: string | null;
  contributors: string[];
  /** e.g. "14 August 2024 – 14 August 2026" */
  dateRangeLabel: string | null;
  design: ResolvedDesign;
  days: ExportDay[];
  includeCover: boolean;
  /** Which text was printed, stated on the title page so a printed book is honest. */
  textVersion: "original" | "current";
  generatedAt: string;
};

function runsFrom(node: RichTextNode): ExportRun[] {
  const runs: ExportRun[] = [];

  const walk = (current: RichTextNode, inherited: ExportRun) => {
    if (current.type === "text") {
      const run: ExportRun = { ...inherited, text: current.text ?? "" };
      for (const mark of current.marks ?? []) {
        if (mark.type === "bold") run.bold = true;
        if (mark.type === "italic") run.italic = true;
        if (mark.type === "underline") run.underline = true;
        if (mark.type === "link" && typeof mark.attrs?.href === "string") {
          run.href = mark.attrs.href;
        }
      }
      if (run.text.length > 0) runs.push(run);
      return;
    }

    if (current.type === "hardBreak") {
      // Print needs a real newline; both renderers honour \n inside a run.
      runs.push({ ...inherited, text: "\n" });
      return;
    }

    for (const child of current.content ?? []) walk(child, inherited);
  };

  for (const child of node.content ?? []) walk(child, { text: "" });
  return runs;
}

/** Flatten a rich-text document into printable blocks. */
export function toExportBlocks(content: unknown): ExportBlock[] {
  const doc = asRichTextDoc(content);
  const blocks: ExportBlock[] = [];

  const pushList = (node: RichTextNode, ordered: boolean) => {
    for (const item of node.content ?? []) {
      blocks.push({ type: "listItem", ordered, runs: runsFrom(item) });
    }
  };

  for (const node of doc.content ?? []) {
    switch (node.type) {
      case "paragraph": {
        const align = node.attrs?.textAlign;
        blocks.push({
          type: "paragraph",
          runs: runsFrom(node),
          align:
            align === "center" || align === "right" ? align : "left",
        });
        break;
      }
      case "heading": {
        const raw = typeof node.attrs?.level === "number" ? node.attrs.level : 2;
        const level = (raw < 1 ? 1 : raw > 3 ? 3 : raw) as 1 | 2 | 3;
        blocks.push({ type: "heading", level, runs: runsFrom(node) });
        break;
      }
      case "blockquote":
        // Flatten the quote's paragraphs into quote blocks.
        for (const child of node.content ?? []) {
          blocks.push({ type: "quote", runs: runsFrom(child) });
        }
        break;
      case "bulletList":
        pushList(node, false);
        break;
      case "orderedList":
        pushList(node, true);
        break;
      case "horizontalRule":
        blocks.push({ type: "rule" });
        break;
      case "image":
        // Images are intentionally not embedded in V1 exports; see the README.
        break;
      default:
        blocks.push({ type: "paragraph", runs: runsFrom(node) });
    }
  }

  // Drop empty trailing paragraphs so a printed page does not open with blanks.
  while (blocks.length > 0) {
    const last = blocks.at(-1)!;
    const isEmpty =
      last.type !== "rule" && last.runs.every((run) => run.text.trim().length === 0);
    if (!isEmpty) break;
    blocks.pop();
  }

  return blocks;
}

export function plainTextOfBlocks(blocks: ExportBlock[]): string {
  return blocks
    .map((block) => (block.type === "rule" ? "" : block.runs.map((run) => run.text).join("")))
    .join("\n")
    .trim();
}

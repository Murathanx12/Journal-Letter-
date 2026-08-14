/**
 * The rich-text document model.
 *
 * Entries are stored as ProseMirror/TipTap JSON. That keeps the writing
 * structured (headings, quotes, lists, emphasis survive an export to print)
 * while staying a plain JSON value in Postgres, so no editor-specific binary
 * blob is ever the only copy of somebody's letters.
 *
 * Alongside it we store a flattened `plain_text`, which is what full-text
 * search indexes and what the AI proofreader reads. Deriving it here — in one
 * place, on the server — means search and export can never disagree about what
 * an entry actually says.
 */

export type Mark = {
  type: string;
  attrs?: Record<string, unknown>;
};

export type RichTextNode = {
  type: string;
  attrs?: Record<string, unknown>;
  content?: RichTextNode[];
  marks?: Mark[];
  text?: string;
};

export type RichTextDoc = {
  type: "doc";
  content?: RichTextNode[];
};

export const EMPTY_DOC: RichTextDoc = {
  type: "doc",
  content: [{ type: "paragraph" }],
};

/** Block-level nodes that should end up on their own line in plain text. */
const BLOCK_TYPES = new Set([
  "paragraph",
  "heading",
  "blockquote",
  "listItem",
  "bulletList",
  "orderedList",
  "codeBlock",
  "horizontalRule",
]);

/**
 * Narrow unknown JSON (as it comes back from Postgres) into a document we can
 * safely walk. Anything unrecognised degrades to an empty document rather than
 * throwing — a malformed row should render as blank, never crash a whole book.
 */
export function asRichTextDoc(value: unknown): RichTextDoc {
  if (!value || typeof value !== "object") return EMPTY_DOC;
  const candidate = value as { type?: unknown; content?: unknown };
  if (candidate.type !== "doc") return EMPTY_DOC;
  return {
    type: "doc",
    content: Array.isArray(candidate.content) ? (candidate.content as RichTextNode[]) : [],
  };
}

export function toPlainText(doc: RichTextDoc | RichTextNode | null | undefined): string {
  if (!doc) return "";

  const lines: string[] = [];
  let current = "";

  const flush = () => {
    lines.push(current);
    current = "";
  };

  const walk = (node: RichTextNode) => {
    if (node.type === "text") {
      current += node.text ?? "";
      return;
    }
    if (node.type === "hardBreak") {
      flush();
      return;
    }

    const isBlock = BLOCK_TYPES.has(node.type);
    // Containers must not add a line of their own — the blocks nested inside
    // them already do. A `listItem` wraps a paragraph, so counting both would
    // put a blank line between every bullet.
    const isContainer =
      node.type === "bulletList" || node.type === "orderedList" || node.type === "listItem";

    for (const child of node.content ?? []) walk(child);

    if (isBlock && !isContainer) flush();
  };

  for (const node of doc.content ?? []) walk(node);
  if (current) flush();

  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

export function isEmptyDoc(doc: RichTextDoc | null | undefined): boolean {
  return toPlainText(doc).trim().length === 0;
}

/**
 * Turn pasted plain text into a document.
 *
 * This is the workhorse of importing old letters: a WhatsApp message pasted in
 * as text becomes real paragraphs. Blank lines separate paragraphs; single
 * newlines become hard breaks, which preserves the shape of writing that used
 * line breaks for rhythm rather than for structure.
 */
export function fromPlainText(text: string): RichTextDoc {
  const normalised = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const blocks = normalised.split(/\n{2,}/);

  const content: RichTextNode[] = blocks
    .map((block) => block.trim())
    .filter((block) => block.length > 0)
    .map((block) => {
      const nodes: RichTextNode[] = [];
      const segments = block.split("\n");
      segments.forEach((segment, index) => {
        if (index > 0) nodes.push({ type: "hardBreak" });
        if (segment.length > 0) nodes.push({ type: "text", text: segment });
      });
      return { type: "paragraph", content: nodes };
    });

  return { type: "doc", content: content.length > 0 ? content : EMPTY_DOC.content };
}

/**
 * A short, clean excerpt for cards and search results. Cuts on a word boundary
 * so a preview never ends mid-word.
 */
export function excerpt(text: string, maxLength = 180): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= maxLength) return clean;
  const cut = clean.slice(0, maxLength);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > maxLength * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

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
 * A copy of an editor document made of nothing but ordinary objects.
 *
 * This is not tidiness; without it a Server Action receives a document with
 * every attribute missing.
 *
 * ProseMirror builds each node's attributes with `Object.create(null)`, and
 * `toJSON` hands that very object out rather than a copy. React's Server Action
 * serializer will not treat a null-prototype object as data: it encodes it as
 * an opaque *temporary reference* — the `"$T"` you see in a request body —
 * which the server may pass back to the client but must never read. Reading one
 * throws "You cannot dot into a temporary client reference from a server
 * component".
 *
 * So everything carried in an attribute — a paragraph's alignment, a poem's
 * typeface, and a photograph's storage path — arrives as nothing at all.
 * Autosave was never affected, because it goes through `fetch` and
 * `JSON.stringify`; only the explicit Save button, which is a Server Action,
 * was losing them.
 *
 * A JSON round trip is the fix and also the check: anything that survives it is
 * something React can serialize.
 */
export function toPlainDoc(value: unknown): RichTextDoc {
  return asRichTextDoc(JSON.parse(JSON.stringify(value ?? null)));
}

// -----------------------------------------------------------------------------
// Photographs written into the letter itself
//
// An image node carries two things that look alike and are not: `path`, the
// durable storage key, and `src`, a signed URL that stops working within the
// hour.
//
// Only `path` is ever stored. The URL is resolved again every time the writing
// is rendered, because a signed URL saved into the document would mean an entry
// opened tomorrow showed broken pictures — and would leave a working credential
// sitting in a row that everybody else in the book can read.
// -----------------------------------------------------------------------------

/** Walk every node in a document, replacing any the mapper returns a value for. */
function mapNodes(doc: RichTextDoc, map: (node: RichTextNode) => RichTextNode): RichTextDoc {
  const visit = (node: RichTextNode): RichTextNode => {
    const mapped = map(node);
    if (!mapped.content) return mapped;
    return { ...mapped, content: mapped.content.map(visit) };
  };

  return { type: "doc", content: (doc.content ?? []).map(visit) };
}

function imagePath(node: RichTextNode): string | null {
  if (node.type !== "image") return null;
  const path = node.attrs?.path;
  return typeof path === "string" && path.length > 0 ? path : null;
}

/** Storage paths of every picture placed in the writing, for batch-signing. */
export function imagePathsInDoc(value: unknown): string[] {
  const paths = new Set<string>();

  const walk = (node: RichTextNode) => {
    const path = imagePath(node);
    if (path) paths.add(path);
    for (const child of node.content ?? []) walk(child);
  };

  for (const node of asRichTextDoc(value).content ?? []) walk(node);
  return [...paths];
}

/**
 * Fill in `src` from freshly signed URLs, ready to render.
 *
 * A picture whose path has no URL — because signing failed, or because the file
 * has since been removed — is left without a `src` and simply does not render,
 * rather than showing a broken image icon in the middle of a letter.
 */
export function withImageUrls(
  value: unknown,
  urls: Map<string, string> | Record<string, string>,
): RichTextDoc {
  const lookup = urls instanceof Map ? urls : new Map(Object.entries(urls));

  return mapNodes(asRichTextDoc(value), (node) => {
    const path = imagePath(node);
    if (!path) return node;
    const url = lookup.get(path);
    return { ...node, attrs: { ...node.attrs, src: url ?? null } };
  });
}

/**
 * Drop every signed URL before the document is written to the database.
 *
 * Applied on the server, so it holds however the document arrived — the explicit
 * Save button, autosave, or a correction being applied.
 */
export function withoutImageUrls(value: unknown): RichTextDoc {
  return mapNodes(asRichTextDoc(value), (node) => {
    if (!imagePath(node)) return node;
    return { ...node, attrs: { ...node.attrs, src: null } };
  });
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

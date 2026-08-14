import type { Mark, RichTextDoc, RichTextNode } from "./rich-text";

/**
 * A letter as WhatsApp text.
 *
 * These letters started life in a WhatsApp thread, and they still go back there:
 * something is written here and then sent. So "copy" does not mean "copy the
 * plain words and lose the emphasis" — WhatsApp has its own markup, and using it
 * means a line meant to be read as *emphasis* still arrives that way.
 *
 *   *bold*   _italic_   ~struck through~   ```monospace```
 *
 * WhatsApp is strict about it: the markers have to touch the text, with no space
 * between marker and word, or it shows the asterisks instead of applying them.
 * That is why leading and trailing spaces are lifted out of each run below
 * rather than wrapped along with it.
 *
 * There is no markup for headings, quotes or links, so those are written out as
 * ordinary lines. Better a letter that reads correctly than one peppered with
 * symbols nobody asked for.
 */

const WRAPPERS: { mark: string; wrapper: string }[] = [
  { mark: "bold", wrapper: "*" },
  { mark: "italic", wrapper: "_" },
  { mark: "strike", wrapper: "~" },
  { mark: "code", wrapper: "```" },
];

/** A stable signature for a set of marks, so identical runs can be merged. */
function signature(marks: Mark[] | undefined): string {
  if (!marks) return "";
  return WRAPPERS.filter(({ mark }) => marks.some((m) => m.type === mark))
    .map(({ mark }) => mark)
    .join(",");
}

function wrap(text: string, marks: string): string {
  if (!marks || text.length === 0) return text;

  // WhatsApp only applies a marker that sits flush against the text, so any
  // surrounding whitespace has to stay outside the markers.
  const leading = text.match(/^\s*/)![0];
  const trailing = text.match(/\s*$/)![0];
  const core = text.slice(leading.length, text.length - trailing.length);
  if (core.length === 0) return text;

  const active = marks.split(",");
  let out = core;
  for (const { mark, wrapper } of WRAPPERS) {
    if (active.includes(mark)) out = `${wrapper}${out}${wrapper}`;
  }

  return `${leading}${out}${trailing}`;
}

type Run = { text: string; marks: string };

function collectRuns(node: RichTextNode, runs: Run[]): void {
  if (node.type === "text") {
    const text = node.text ?? "";
    if (!text) return;
    const marks = signature(node.marks);
    const last = runs.at(-1);
    // Merge neighbours so `**bold**` never comes out as `*bold**more*`.
    if (last && last.marks === marks) last.text += text;
    else runs.push({ text, marks });
    return;
  }

  if (node.type === "hardBreak") {
    runs.push({ text: "\n", marks: "" });
    return;
  }

  for (const child of node.content ?? []) collectRuns(child, runs);
}

function inlineText(node: RichTextNode): string {
  const runs: Run[] = [];
  collectRuns(node, runs);
  return runs.map((run) => wrap(run.text, run.marks)).join("");
}

/**
 * Flattens a block into the text of that block.
 *
 * Blocks are collected rather than lines, because the two kinds of newline in a
 * letter mean different things: a hard break inside a paragraph is one newline,
 * and the gap between two paragraphs is two. Collapsing both to one would send
 * a letter whose shape on the page is gone.
 *
 * A whole list is one block, so its items sit together instead of being spaced
 * out like paragraphs.
 */
function collectBlocks(node: RichTextNode, out: string[], listPrefix?: string): void {
  switch (node.type) {
    case "bulletList": {
      const items: string[] = [];
      for (const child of node.content ?? []) collectBlocks(child, items, "• ");
      out.push(items.join("\n"));
      return;
    }

    case "orderedList": {
      const items: string[] = [];
      let index = 1;
      for (const child of node.content ?? []) collectBlocks(child, items, `${index++}. `);
      out.push(items.join("\n"));
      return;
    }

    case "listItem": {
      const inner: string[] = [];
      for (const child of node.content ?? []) collectBlocks(child, inner);
      out.push(`${listPrefix ?? ""}${inner.join("\n")}`);
      return;
    }

    case "blockquote": {
      const inner: string[] = [];
      for (const child of node.content ?? []) collectBlocks(child, inner);
      out.push(inner.join("\n\n"));
      return;
    }

    case "horizontalRule":
      out.push("—");
      return;

    default:
      out.push(inlineText(node));
  }
}

export function toWhatsAppText(doc: RichTextDoc | null | undefined, title?: string | null): string {
  const blocks: string[] = [];
  if (title?.trim()) blocks.push(wrap(title.trim(), "bold"));

  for (const node of doc?.content ?? []) collectBlocks(node, blocks);

  return blocks
    // An empty paragraph is already expressed by the gap between two blocks;
    // keeping it as well would open a three-line hole in the letter.
    .filter((block) => block.trim().length > 0)
    .join("\n\n")
    .trim();
}

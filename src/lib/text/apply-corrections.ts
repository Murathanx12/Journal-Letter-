import { toPlainText, type RichTextDoc, type RichTextNode } from "./rich-text";

/**
 * Apply accepted corrections back into the document.
 *
 * The matching rule is strict: a block is only replaced when its current plain
 * text is *exactly* the text that was sent for proofreading. If the writer kept
 * typing while the check was running, the paragraph no longer matches and is
 * left alone. Silently overwriting newer words with a correction to older ones
 * would be the worst possible bug in a product about preserving writing.
 *
 * A replaced block keeps its type and attributes (a quote stays a quote, a
 * heading stays a heading) but its inline marks are rebuilt as plain text —
 * we know the corrected string, not where the bold used to start. Only blocks
 * the writer explicitly accepted are touched.
 */

function textToInline(text: string): RichTextNode[] {
  const nodes: RichTextNode[] = [];
  const lines = text.split("\n");

  lines.forEach((line, index) => {
    if (index > 0) nodes.push({ type: "hardBreak" });
    if (line.length > 0) nodes.push({ type: "text", text: line });
  });

  return nodes;
}

export function applyParagraphCorrections(
  doc: RichTextDoc,
  accepted: readonly { original: string; corrected: string }[],
): RichTextDoc {
  if (accepted.length === 0) return doc;

  // Several paragraphs can legitimately be identical ("I love you."), so each
  // correction is consumed once, in document order.
  const remaining = accepted.map((correction) => ({ ...correction, used: false }));

  const content = (doc.content ?? []).map((block) => {
    const blockText = toPlainText({ type: "doc", content: [block] });

    const match = remaining.find(
      (correction) => !correction.used && correction.original.trim() === blockText.trim(),
    );
    if (!match) return block;

    match.used = true;
    return { ...block, content: textToInline(match.corrected) };
  });

  return { type: "doc", content };
}

/**
 * The blocks of an entry as flat strings, in the order the proofreader will see
 * them. Index positions here are what `ParagraphCorrection.index` refers to.
 */
export function toParagraphs(doc: RichTextDoc): string[] {
  return (doc.content ?? []).map((block) => toPlainText({ type: "doc", content: [block] }));
}

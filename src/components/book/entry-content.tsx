import { Fragment, type ReactNode } from "react";

import { knownFontStack } from "@/lib/design/theme";
import { asRichTextDoc, type Mark, type RichTextNode } from "@/lib/text/rich-text";

/**
 * Renders a stored rich-text document.
 *
 * This walks the document and builds React elements. It deliberately does not
 * convert to an HTML string and inject it: `dangerouslySetInnerHTML` over
 * user-authored content is the obvious way to hand somebody a stored XSS, and
 * in a shared book that content was written by another person.
 *
 * Unknown node types render their children rather than disappearing, so a
 * document produced by a future editor version degrades to readable text
 * instead of to a blank page.
 */

/** `javascript:` and `data:` URLs in a link are script execution in disguise. */
function safeHref(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (/^(https?:|mailto:|tel:)/i.test(trimmed)) return trimmed;
  // Allow same-page and relative links; reject everything else, including
  // protocol-relative URLs that could be pointed anywhere.
  if (/^[#/](?![/\\])/.test(trimmed)) return trimmed;
  return null;
}

function applyMarks(text: string, marks: Mark[] | undefined, keyPrefix: string): ReactNode {
  if (!marks || marks.length === 0) return text;

  // Innermost mark first, so the outermost ends up wrapping everything.
  return marks.reduce<ReactNode>((child, mark, index) => {
    const key = `${keyPrefix}-m${index}`;
    switch (mark.type) {
      case "bold":
        return <strong key={key}>{child}</strong>;
      case "italic":
        return <em key={key}>{child}</em>;
      case "underline":
        return <u key={key}>{child}</u>;
      case "strike":
        return <s key={key}>{child}</s>;
      case "code":
        return (
          <code key={key} className="rounded bg-surface-sunk px-1 py-0.5 text-[0.9em]">
            {child}
          </code>
        );
      case "textStyle": {
        // A typeface chosen for this stretch of writing. Validated against the
        // fonts this application offers rather than handed straight to CSS.
        const fontFamily = knownFontStack(mark.attrs?.fontFamily);
        if (!fontFamily) return child;
        return (
          <span key={key} style={{ fontFamily }}>
            {child}
          </span>
        );
      }

      case "link": {
        const href = safeHref(mark.attrs?.href);
        if (!href) return child;
        return (
          <a key={key} href={href} target="_blank" rel="noopener noreferrer nofollow">
            {child}
          </a>
        );
      }
      default:
        return child;
    }
  }, text);
}

function renderNodes(nodes: RichTextNode[] | undefined, keyPrefix: string): ReactNode[] {
  return (nodes ?? []).map((node, index) => renderNode(node, `${keyPrefix}-${index}`));
}

function renderNode(node: RichTextNode, key: string): ReactNode {
  switch (node.type) {
    case "text":
      return <Fragment key={key}>{applyMarks(node.text ?? "", node.marks, key)}</Fragment>;

    case "hardBreak":
      return <br key={key} />;

    case "horizontalRule":
      return <hr key={key} className="my-8 border-0 border-t border-rule" />;

    case "paragraph": {
      const align = node.attrs?.textAlign;
      return (
        <p
          key={key}
          style={typeof align === "string" && align !== "left" ? { textAlign: align as "center" | "right" | "justify" } : undefined}
        >
          {renderNodes(node.content, key)}
        </p>
      );
    }

    case "heading": {
      const level = typeof node.attrs?.level === "number" ? node.attrs.level : 2;
      // Entries live inside a page that already has an <h1>, so headings inside
      // an entry start at <h2> to keep the outline sane for screen readers.
      const Tag = (level <= 1 ? "h2" : level === 2 ? "h3" : "h4") as "h2" | "h3" | "h4";
      return <Tag key={key}>{renderNodes(node.content, key)}</Tag>;
    }

    case "blockquote":
      return <blockquote key={key}>{renderNodes(node.content, key)}</blockquote>;

    case "bulletList":
      return <ul key={key}>{renderNodes(node.content, key)}</ul>;

    case "orderedList":
      return <ol key={key}>{renderNodes(node.content, key)}</ol>;

    case "listItem":
      return <li key={key}>{renderNodes(node.content, key)}</li>;

    case "codeBlock":
      return (
        <pre key={key} className="overflow-x-auto rounded-lg bg-surface-sunk p-4 text-sm">
          <code>{renderNodes(node.content, key)}</code>
        </pre>
      );

    case "image": {
      const src = safeHref(node.attrs?.src);
      if (!src) return null;
      const alt = typeof node.attrs?.alt === "string" ? node.attrs.alt : "";
      return (
        <figure key={key}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={alt} loading="lazy" />
          {typeof node.attrs?.title === "string" && node.attrs.title ? (
            <figcaption className="mt-1 text-center text-xs text-ink-muted">
              {node.attrs.title}
            </figcaption>
          ) : null}
        </figure>
      );
    }

    default:
      // Unknown block: keep the words, lose the formatting.
      return <Fragment key={key}>{renderNodes(node.content, key)}</Fragment>;
  }
}

export function EntryContent({ content }: { content: unknown }) {
  const doc = asRichTextDoc(content);
  return <>{renderNodes(doc.content, "n")}</>;
}

"use client";

import Image from "@tiptap/extension-image";
import TextAlign from "@tiptap/extension-text-align";
import { FontFamily, TextStyle } from "@tiptap/extension-text-style";
import { Placeholder } from "@tiptap/extensions";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useCallback, useEffect, useRef, type ReactNode } from "react";

import { BookPages, type BookPagesHandle } from "@/components/book/book-pages";
import { PAGE_HEIGHT } from "@/lib/design/pages";
import type { RichTextDoc } from "@/lib/text/rich-text";

import { EditorToolbar } from "./editor-toolbar";
import { SpellingSuggestions } from "./spelling-suggestions";

/**
 * The writing surface.
 *
 * Deliberately smaller than a word processor: bold, italic, underline, a
 * typeface for a poem, headings, quote, two kinds of list, alignment, links,
 * pictures, undo. Anything more would get in the way of the actual job, which is
 * writing a letter.
 *
 * It writes onto real pages. As the letter grows past the bottom of the right
 * page it carries on onto the next spread, exactly as it will when it is read
 * and when it is printed — so what a page will look like is not something to be
 * imagined and checked afterwards.
 *
 * `spellcheck` is on and stays on. The browser's own spelling help is immediate,
 * private, costs nothing, and understands whatever languages the writer has
 * installed — which the click-to-fix highlights deliberately do not attempt.
 */
export function RichTextEditor({
  initialContent,
  placeholder,
  editable = true,
  onChange,
  onEditorReady,
  onSuggestionApplied,
  onPasteFiles,
  stickers,
  toolbarExtra,
  footer,
}: {
  initialContent: RichTextDoc;
  placeholder?: string;
  editable?: boolean;
  onChange?: (doc: RichTextDoc) => void;
  onEditorReady?: (editor: Editor) => void;
  /** Fired when a spelling highlight is clicked and the fix applied. */
  onSuggestionApplied?: (remaining: number) => void;
  /** Images arriving by paste or drop, in the order they were given. */
  onPasteFiles?: (files: File[]) => void;
  /** Photographs already on these pages, drawn among the writing. */
  stickers?: ReactNode;
  toolbarExtra?: ReactNode;
  footer?: ReactNode;
}) {
  const pages = useRef<BookPagesHandle>(null);

  /**
   * Keep the caret on a whole spread.
   *
   * Typing past the bottom of a page makes the browser scroll the box just far
   * enough to reveal the caret, which leaves the reader looking at the right
   * half of one spread and the left half of the next. This turns the page
   * properly instead.
   */
  const followCaret = useCallback((instance: Editor) => {
    if (!instance.isFocused) return;
    try {
      const { left } = instance.view.coordsAtPos(instance.state.selection.head);
      pages.current?.showColumnAt(left);
    } catch {
      // `coordsAtPos` throws if the document changed under it; the next
      // keystroke will do the same job a moment later.
    }
  }, []);

  const editor = useEditor({
    // Server-rendering a ProseMirror instance produces hydration mismatches.
    immediatelyRender: false,
    editable,
    extensions: [
      // StarterKit already provides Link, Underline and the list keymap in v3,
      // so registering those separately would throw a duplicate-extension error.
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        link: {
          openOnClick: false,
          autolink: true,
          // Without this, pasting a `javascript:` URL creates a live XSS link.
          protocols: ["http", "https", "mailto"],
          HTMLAttributes: { rel: "noopener noreferrer nofollow", target: "_blank" },
        },
      }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      // `FontFamily` writes onto a `textStyle` mark, so both are needed —
      // registering the second without the first silently does nothing.
      TextStyle,
      FontFamily,
      Image.configure({ inline: false, allowBase64: false }),
      Placeholder.configure({ placeholder: placeholder ?? "Write…" }),
      SpellingSuggestions.configure({
        onApply: (remaining) => onSuggestionApplied?.(remaining),
      }),
    ],
    content: initialContent,
    editorProps: {
      attributes: {
        class: "tiptap book-prose",
        spellcheck: "true",
        "aria-label": "Entry text",
      },
      handlePaste(_view, event) {
        // The universal gesture. A screenshot or a copied photograph is put on
        // the page the same way Ctrl/⌘ + P would put it there.
        const files = imageFiles(event.clipboardData?.files);
        if (files.length === 0 || !onPasteFiles) return false;
        event.preventDefault();
        onPasteFiles(files);
        return true;
      },
      handleDrop(_view, event) {
        const files = imageFiles((event as DragEvent).dataTransfer?.files);
        if (files.length === 0 || !onPasteFiles) return false;
        event.preventDefault();
        onPasteFiles(files);
        return true;
      },
    },
    onUpdate({ editor: instance }) {
      onChange?.(instance.getJSON() as RichTextDoc);
      followCaret(instance);
    },
    onSelectionUpdate({ editor: instance }) {
      followCaret(instance);
    },
  });

  useEffect(() => {
    if (editor && onEditorReady) onEditorReady(editor);
  }, [editor, onEditorReady]);

  if (!editor) {
    // Reserve the space so the page does not jump when the editor mounts.
    return (
      <div
        className="animate-pulse rounded-card border border-rule bg-surface-sunk/40"
        style={{ height: PAGE_HEIGHT }}
      />
    );
  }

  return (
    <div className="space-y-3">
      {editable ? (
        <div className="rounded-card border border-rule bg-surface">
          <EditorToolbar editor={editor} extra={toolbarExtra} />
        </div>
      ) : null}

      <BookPages
        ref={pages}
        pageHeight={PAGE_HEIGHT}
        label="The pages you are writing on"
        footer={footer}
      >
        {stickers}
        {/*
          The writing is given a stacking position of its own. Without it, *any*
          positioned sticker would paint over the text, because positioned
          elements always paint above unpositioned ones whatever order they are
          in — so "behind the writing" would silently mean "in front of it".
        */}
        <EditorContent editor={editor} className="relative z-10" />
      </BookPages>
    </div>
  );
}

/** Only real images: a paste of ordinary text carries no files at all. */
function imageFiles(list: FileList | null | undefined): File[] {
  if (!list) return [];
  return Array.from(list).filter((file) => file.type.startsWith("image/"));
}

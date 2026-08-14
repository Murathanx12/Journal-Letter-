"use client";

import Image from "@tiptap/extension-image";
import TextAlign from "@tiptap/extension-text-align";
import { Placeholder } from "@tiptap/extensions";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useEffect } from "react";

import type { RichTextDoc } from "@/lib/text/rich-text";

import { EditorToolbar } from "./editor-toolbar";

/**
 * The writing surface.
 *
 * Deliberately smaller than a word processor: bold, italic, underline,
 * headings, quote, two kinds of list, alignment, links, images, undo. Anything
 * more would get in the way of the actual job, which is writing a letter.
 *
 * `spellcheck` is on and stays on. Browser-native spelling help is immediate,
 * private and costs nothing — the AI proofreader is a separate, explicit step.
 */
export function RichTextEditor({
  initialContent,
  placeholder,
  editable = true,
  onChange,
  onEditorReady,
}: {
  initialContent: RichTextDoc;
  placeholder?: string;
  editable?: boolean;
  onChange?: (doc: RichTextDoc) => void;
  onEditorReady?: (editor: Editor) => void;
}) {
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
      Image.configure({ inline: false, allowBase64: false }),
      Placeholder.configure({ placeholder: placeholder ?? "Write…" }),
    ],
    content: initialContent,
    editorProps: {
      attributes: {
        class: "tiptap book-prose",
        spellcheck: "true",
        "aria-label": "Entry text",
      },
    },
    onUpdate({ editor: instance }) {
      onChange?.(instance.getJSON() as RichTextDoc);
    },
  });

  useEffect(() => {
    if (editor && onEditorReady) onEditorReady(editor);
  }, [editor, onEditorReady]);

  if (!editor) {
    // Reserve the space so the page does not jump when the editor mounts.
    return (
      <div className="min-h-96 animate-pulse rounded-card border border-rule bg-surface-sunk/40" />
    );
  }

  return (
    <div className="rounded-card border border-rule bg-surface">
      {editable ? <EditorToolbar editor={editor} /> : null}
      <div className="px-5 py-5 sm:px-8 sm:py-7">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}

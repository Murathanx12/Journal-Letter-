"use client";

import TextAlign from "@tiptap/extension-text-align";
import { FontFamily, TextStyle } from "@tiptap/extension-text-style";
import { Placeholder } from "@tiptap/extensions";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import { BookPages, type BookPagesHandle } from "@/components/book/book-pages";
import { PAGE_HEIGHT } from "@/lib/design/pages";
import { toPlainDoc, type RichTextDoc } from "@/lib/text/rich-text";

import { BookImage, PIN_TO_PAGE_EVENT, type PinToPage } from "./book-image";
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
  onPinPicture,
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
  /** Takes a picture out of the writing and pins it to the page. */
  onPinPicture?: (picture: PinToPage) => void;
  /** Photographs already on these pages, drawn among the writing. */
  stickers?: ReactNode;
  toolbarExtra?: ReactNode;
  footer?: ReactNode;
}) {
  const pages = useRef<BookPagesHandle>(null);

  /**
   * Depth rather than a boolean: `dragleave` fires every time the pointer
   * crosses into a child element, so a flag would flicker off half way across
   * the page. Counting enters against leaves does not.
   */
  const [dropTarget, setDropTarget] = useState(0);

  /** The box the editor lives in; picture events bubble out to here. */
  const surface = useRef<HTMLDivElement>(null);

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
      // Pictures written into the letter itself, at the caret. The scrapbook
      // stickers pinned to a page are a separate thing entirely — see
      // `PlacedMedia` and the Photos tab.
      //
      // `resize` stays off: the extension's own handles commit a pixel width,
      // and a page in this book is a different number of pixels on a phone, on
      // a laptop and in a PDF. `BookImage` stores a fraction of the column and
      // provides its own handles. `allowBase64` stays off because a pasted
      // data: URL would be inlined into the row instead of uploaded.
      BookImage.configure({
        inline: false,
        allowBase64: false,
        resize: false,
      }),
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
      // `toPlainDoc`, not a cast. `getJSON` returns ProseMirror's own
      // null-prototype attribute objects, which a Server Action cannot
      // serialize — see the note on `toPlainDoc`. Doing it here means every
      // consumer of `onChange` gets a document that can actually be saved.
      onChange?.(toPlainDoc(instance.getJSON()));
      followCaret(instance);
    },
    onSelectionUpdate({ editor: instance }) {
      followCaret(instance);
    },
  });

  useEffect(() => {
    if (editor && onEditorReady) onEditorReady(editor);
  }, [editor, onEditorReady]);

  /**
   * A picture asking to be taken out of the writing and pinned to the page.
   *
   * Listened for rather than passed in, so the handler is always the current
   * one — an extension option would have been frozen at editor creation.
   */
  useEffect(() => {
    const node = surface.current;
    if (!node || !onPinPicture) return;

    const handle = (event: Event) => {
      onPinPicture((event as CustomEvent<PinToPage>).detail);
      // Tells the picture it was actually taken. Without an answer it stays in
      // the writing rather than vanishing into a listener that is not there.
      event.preventDefault();
    };

    node.addEventListener(PIN_TO_PAGE_EVENT, handle);
    return () => node.removeEventListener(PIN_TO_PAGE_EVENT, handle);
    // `editor` matters: the surface does not exist until the editor has
    // mounted, and without it this effect runs once against a null ref and
    // never again.
  }, [editor, onPinPicture]);

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

      {/*
        Dropping a photograph is handled by the editor itself, which knows where
        in the writing the pointer is. All this does is *say so* while the file
        is still hovering — without it, dragging a picture onto the page is a
        guess, and a guess that fails silently if it lands outside the editor.
      */}
      <div
        ref={surface}
        className="relative"
        onDragEnter={(event) => {
          if (dragCarriesFiles(event)) setDropTarget((depth) => depth + 1);
        }}
        onDragOver={(event) => {
          // Without this the browser refuses the drop and navigates to the file.
          if (dragCarriesFiles(event)) event.preventDefault();
        }}
        onDragLeave={() => setDropTarget((depth) => Math.max(0, depth - 1))}
        onDrop={() => setDropTarget(0)}
      >
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

        {editable && dropTarget > 0 ? (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center rounded-card border-2 border-dashed border-brand bg-paper/70"
          >
            <p className="rounded-full bg-ink px-4 py-2 text-sm text-paper shadow-sm">
              Drop the picture into your writing
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Is this drag carrying files, rather than a selection of text being moved
 * around inside the editor?
 *
 * `dataTransfer.files` is deliberately empty during a drag for privacy — the
 * page is not allowed to read what is being dragged until it is dropped — so
 * the answer has to come from `types`.
 */
function dragCarriesFiles(event: React.DragEvent): boolean {
  return Array.from(event.dataTransfer?.types ?? []).includes("Files");
}

/** Only real images: a paste of ordinary text carries no files at all. */
function imageFiles(list: FileList | null | undefined): File[] {
  if (!list) return [];
  return Array.from(list).filter((file) => file.type.startsWith("image/"));
}

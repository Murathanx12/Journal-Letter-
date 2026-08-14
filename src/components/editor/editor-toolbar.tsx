"use client";

import type { Editor } from "@tiptap/react";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Heading2,
  Heading3,
  Italic,
  Link2,
  List,
  ListOrdered,
  Quote,
  Redo2,
  Strikethrough,
  Underline as UnderlineIcon,
  Undo2,
} from "lucide-react";
import { useCallback, useEffect, useState, type ReactNode } from "react";

import { FONTS, FONT_IDS } from "@/lib/design/theme";
import { cn } from "@/lib/utils/cn";

function ToolbarButton({
  onClick,
  active,
  disabled,
  label,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  label: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      // `onMouseDown` preventDefault keeps the caret where it was; without it,
      // clicking a button steals focus and formatting applies to nothing.
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors disabled:opacity-40",
        active ? "bg-ink text-paper" : "text-ink-muted hover:bg-surface-sunk hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}

function Separator() {
  return <span className="mx-1 h-5 w-px bg-rule" aria-hidden="true" />;
}

/**
 * Setting a stretch of writing in a different typeface — a poem in the
 * handwriting face, a quoted letter in the typewriter one.
 *
 * The value stored on the mark is the font's whole CSS stack rather than its
 * name. That keeps the document self-describing: it renders correctly anywhere
 * the fonts are loaded, without a lookup table having to travel with it.
 */
function FontPicker({ editor }: { editor: Editor }) {
  const current = (editor.getAttributes("textStyle").fontFamily as string | undefined) ?? "";
  const selected = FONT_IDS.find((id) => FONTS[id].stack === current) ?? "";

  return (
    <label className="flex items-center gap-1.5 text-xs text-ink-muted">
      <span className="sr-only">Typeface</span>
      <select
        value={selected}
        onMouseDown={(event) => event.stopPropagation()}
        onChange={(event) => {
          const value = event.target.value;
          if (!value) editor.chain().focus().unsetFontFamily().run();
          else editor.chain().focus().setFontFamily(FONTS[value as keyof typeof FONTS].stack).run();
        }}
        aria-label="Typeface"
        title="Typeface"
        className="h-8 rounded-md border border-rule bg-surface px-2 text-xs text-ink transition-colors hover:border-rule-strong focus-visible:outline-2"
      >
        <option value="">Book’s own</option>
        {FONT_IDS.map((id) => (
          <option key={id} value={id}>
            {FONTS[id].label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function EditorToolbar({ editor, extra }: { editor: Editor; extra?: ReactNode }) {
  // TipTap mutates its own state; React needs a nudge to re-read `isActive`.
  const [, forceUpdate] = useState(0);

  useEffect(() => {
    const rerender = () => forceUpdate((value) => value + 1);
    editor.on("selectionUpdate", rerender);
    editor.on("transaction", rerender);
    return () => {
      editor.off("selectionUpdate", rerender);
      editor.off("transaction", rerender);
    };
  }, [editor]);

  const setLink = useCallback(() => {
    const previous = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("Link address", previous ?? "https://");

    // Cancelled: leave the document untouched.
    if (url === null) return;

    if (url.trim() === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    if (!/^(https?:|mailto:)/i.test(url.trim())) {
      window.alert("Links must start with http://, https:// or mailto:");
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url.trim() }).run();
  }, [editor]);

  return (
    <div
      role="toolbar"
      aria-label="Formatting"
      className="flex flex-wrap items-center gap-0.5 border-b border-rule px-2 py-1.5"
    >
      <ToolbarButton
        label="Bold"
        active={editor.isActive("bold")}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <Bold className="h-4 w-4" aria-hidden="true" />
      </ToolbarButton>
      <ToolbarButton
        label="Italic"
        active={editor.isActive("italic")}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <Italic className="h-4 w-4" aria-hidden="true" />
      </ToolbarButton>
      <ToolbarButton
        label="Underline"
        active={editor.isActive("underline")}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
      >
        <UnderlineIcon className="h-4 w-4" aria-hidden="true" />
      </ToolbarButton>
      <ToolbarButton
        label="Strikethrough"
        active={editor.isActive("strike")}
        onClick={() => editor.chain().focus().toggleStrike().run()}
      >
        <Strikethrough className="h-4 w-4" aria-hidden="true" />
      </ToolbarButton>

      <Separator />

      <FontPicker editor={editor} />

      <Separator />

      <ToolbarButton
        label="Heading"
        active={editor.isActive("heading", { level: 2 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
      >
        <Heading2 className="h-4 w-4" aria-hidden="true" />
      </ToolbarButton>
      <ToolbarButton
        label="Sub-heading"
        active={editor.isActive("heading", { level: 3 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
      >
        <Heading3 className="h-4 w-4" aria-hidden="true" />
      </ToolbarButton>
      <ToolbarButton
        label="Quote"
        active={editor.isActive("blockquote")}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
      >
        <Quote className="h-4 w-4" aria-hidden="true" />
      </ToolbarButton>

      <Separator />

      <ToolbarButton
        label="Bulleted list"
        active={editor.isActive("bulletList")}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      >
        <List className="h-4 w-4" aria-hidden="true" />
      </ToolbarButton>
      <ToolbarButton
        label="Numbered list"
        active={editor.isActive("orderedList")}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      >
        <ListOrdered className="h-4 w-4" aria-hidden="true" />
      </ToolbarButton>

      <Separator />

      <ToolbarButton
        label="Align left"
        active={editor.isActive({ textAlign: "left" })}
        onClick={() => editor.chain().focus().setTextAlign("left").run()}
      >
        <AlignLeft className="h-4 w-4" aria-hidden="true" />
      </ToolbarButton>
      <ToolbarButton
        label="Align centre"
        active={editor.isActive({ textAlign: "center" })}
        onClick={() => editor.chain().focus().setTextAlign("center").run()}
      >
        <AlignCenter className="h-4 w-4" aria-hidden="true" />
      </ToolbarButton>
      <ToolbarButton
        label="Align right"
        active={editor.isActive({ textAlign: "right" })}
        onClick={() => editor.chain().focus().setTextAlign("right").run()}
      >
        <AlignRight className="h-4 w-4" aria-hidden="true" />
      </ToolbarButton>

      <Separator />

      <ToolbarButton label="Link" active={editor.isActive("link")} onClick={setLink}>
        <Link2 className="h-4 w-4" aria-hidden="true" />
      </ToolbarButton>

      <Separator />

      <ToolbarButton
        label="Undo"
        disabled={!editor.can().undo()}
        onClick={() => editor.chain().focus().undo().run()}
      >
        <Undo2 className="h-4 w-4" aria-hidden="true" />
      </ToolbarButton>
      <ToolbarButton
        label="Redo"
        disabled={!editor.can().redo()}
        onClick={() => editor.chain().focus().redo().run()}
      >
        <Redo2 className="h-4 w-4" aria-hidden="true" />
      </ToolbarButton>

      {extra ? <div className="ml-auto flex items-center gap-1">{extra}</div> : null}
    </div>
  );
}

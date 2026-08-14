"use client";

import type { Editor } from "@tiptap/react";
import { AlertTriangle, Check, CloudOff, ImagePlus, Loader2, Lock, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";

import { CopyButton } from "@/components/editor/copy-button";
import { SpellingBar } from "@/components/editor/spelling-bar";
import { RichTextEditor } from "@/components/editor/rich-text-editor";
import { PageStickers } from "@/components/media/media-layer";
import { PhotoArranger } from "@/components/media/photo-arranger";
import { PhotoPanel } from "@/components/media/photo-panel";
import { splitByLayer, type PlacedMedia } from "@/lib/media/placement";
import { useMediaUpload } from "@/lib/media/use-upload";
import {
  localDraftKey,
  readLocalDraft,
  useAutosave,
  type LocalDraft,
  type SaveStatus,
} from "@/components/editor/use-autosave";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, FormError, Input } from "@/components/ui/form";
import { Card } from "@/components/ui/surface";
import { captureOriginal, deleteEntry, saveEntry } from "@/lib/entries/actions";
import type { WordSuggestion } from "@/lib/proofread/suggestions";
import { countWords, EMPTY_DOC, toPlainText, type RichTextDoc } from "@/lib/text/rich-text";
import { formatLongDate, type CalendarDate } from "@/lib/date/calendar-date";
import { cn } from "@/lib/utils/cn";
import { useHydrated } from "@/lib/utils/use-hydrated";

export type ComposerEntry = {
  id: string;
  entryDate: CalendarDate;
  title: string | null;
  content: RichTextDoc;
  status: "draft" | "published";
  tags: string[];
  sealedUntil: CalendarDate | null;
  hasOriginal: boolean;
  correctionState: "original" | "gentle" | "polish";
  layout: PlacedMedia[];
};

export function EntryComposer({
  bookId,
  bookToday,
  entry,
  initialMediaUrls,
  indentParagraphs,
}: {
  bookId: string;
  /** Today in the *book's* timezone, computed on the server. */
  bookToday: CalendarDate;
  entry: ComposerEntry | null;
  /** Signed URLs for photographs already on the page, keyed by storage path. */
  initialMediaUrls?: Record<string, string>;
  indentParagraphs?: boolean;
}) {
  const router = useRouter();
  const [saving, startSaving] = useTransition();
  const hydrated = useHydrated();

  const [entryDate, setEntryDate] = useState<CalendarDate>(entry?.entryDate ?? bookToday);
  const [title, setTitle] = useState(entry?.title ?? "");
  const [content, setContent] = useState<RichTextDoc>(entry?.content ?? EMPTY_DOC);
  const [tagsText, setTagsText] = useState((entry?.tags ?? []).join(", "));
  const [sealed, setSealed] = useState(Boolean(entry?.sealedUntil));
  const [sealedUntil, setSealedUntil] = useState<string>(entry?.sealedUntil ?? "");
  const [error, setError] = useState<string | null>(null);
  const [recoveryDismissed, setRecoveryDismissed] = useState(false);
  const editorRef = useRef<Editor | null>(null);

  const [suggestionCount, setSuggestionCount] = useState(0);
  /**
   * The document as it stood before any suggestion was accepted. Snapshotted
   * when a check runs, so the entry's stored "original" is the author's own
   * words rather than whatever was left after the first fix.
   */
  const preCorrectionDoc = useRef<RichTextDoc | null>(null);
  const originalCaptured = useRef(false);

  const [tab, setTab] = useState<"write" | "photos">("write");
  const [layout, setLayout] = useState<PlacedMedia[]>(entry?.layout ?? []);
  const [selectedMediaId, setSelectedMediaId] = useState<string | null>(null);
  const [mediaUrls, setMediaUrls] = useState<Map<string, string>>(
    () => new Map(Object.entries(initialMediaUrls ?? {})),
  );
  const photoInput = useRef<HTMLInputElement>(null);

  // A counter rather than a boolean, so "has this exact text been saved?" is a
  // comparison instead of a flag somebody has to remember to reset.
  const [changeCount, setChangeCount] = useState(0);
  const touch = useCallback(() => setChangeCount((count) => count + 1), []);

  const autosave = useAutosave({
    bookId,
    initialEntryId: entry?.id ?? null,
    entryDate,
    title,
    content,
    layout,
    changeCount,
  });

  /**
   * If a previous session died mid-sentence, offer the local copy back rather
   * than silently overwriting it with whatever the server last saw. Read during
   * render (once hydrated) instead of in an effect, so there is no flash of the
   * page without the banner.
   */
  const recovered = useMemo<LocalDraft | null>(() => {
    if (!hydrated || recoveryDismissed || changeCount > 0) return null;
    return readLocalDraft(localDraftKey(bookId, entry?.id ?? null));
  }, [hydrated, recoveryDismissed, changeCount, bookId, entry?.id]);

  const plainText = useMemo(() => toPlainText(content), [content]);
  const words = countWords(plainText);
  const isBackdated = entryDate !== bookToday;

  const handleChange = useCallback(
    (doc: RichTextDoc) => {
      setContent(doc);
      touch();
    },
    [touch],
  );

  const handleEditorReady = useCallback((instance: Editor) => {
    editorRef.current = instance;
  }, []);

  const handleSuggestions = useCallback(
    (suggestions: WordSuggestion[]) => {
      preCorrectionDoc.current = content;
      editorRef.current?.commands.setSpellingSuggestions(suggestions);
      setSuggestionCount(suggestions.length);
    },
    [content],
  );

  const handleClearSuggestions = useCallback(() => {
    editorRef.current?.commands.clearSpellingSuggestions();
    setSuggestionCount(0);
  }, []);

  const { upload, uploading, error: uploadError } = useMediaUpload({
    bookId,
    entryId: autosave.entryId,
  });

  /**
   * A picture arriving by Ctrl/⌘ + P, by paste or by drop.
   *
   * It lands on the page and stays selected, so the Photos tab opens with the
   * right picture already in hand — but the writer is left where they were,
   * mid-sentence, rather than being thrown into another mode.
   */
  const addPhotos = useCallback(
    async (files: readonly File[]) => {
      if (files.length === 0) return;
      const { placed, urls } = await upload(files);
      if (urls.length > 0) {
        setMediaUrls((current) => {
          const next = new Map(current);
          for (const [path, url] of urls) next.set(path, url);
          return next;
        });
      }
      if (placed.length > 0) {
        setLayout((current) => [...current, ...placed]);
        setSelectedMediaId(placed.at(-1)!.id);
        touch();
      }
    },
    [upload, touch],
  );

  const stickers = useMemo(() => splitByLayer(layout), [layout]);

  /**
   * The two ways a picture gets onto the page, bound to the whole screen rather
   * than to the editor.
   *
   * Bound to the editor they would only work while the caret happened to be in
   * the text — press Ctrl/⌘ + P a moment after clicking a toolbar control and
   * nothing would happen, or worse, the browser's print dialogue would open.
   *
   * Ctrl/⌘ + P does cost the print dialogue *on this screen*. Printing a letter
   * from the middle of writing it is not something anybody does, and the reading
   * view — which is the one worth printing — still prints normally.
   */
  useEffect(() => {
    if (tab !== "write") return;

    function onKeyDown(event: KeyboardEvent) {
      if (!(event.ctrlKey || event.metaKey) || event.shiftKey || event.altKey) return;
      if (event.key.toLowerCase() !== "p") return;
      event.preventDefault();
      photoInput.current?.click();
    }

    function onPaste(event: ClipboardEvent) {
      // The editor handles a paste that lands in the text and marks it handled;
      // this only catches the ones that would otherwise go nowhere.
      if (event.defaultPrevented) return;
      const files = Array.from(event.clipboardData?.files ?? []).filter((file) =>
        file.type.startsWith("image/"),
      );
      if (files.length === 0) return;
      event.preventDefault();
      void addPhotos(files);
    }

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("paste", onPaste);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("paste", onPaste);
    };
  }, [tab, addPhotos]);

  /**
   * A highlight was clicked and the fix applied.
   *
   * The edit itself already happened in the editor — and is therefore in the
   * undo history. All that is left is to remember the author's untouched words
   * once, so "Restore my original" and "Export original writing" keep working.
   */
  const handleSuggestionApplied = useCallback(
    (remaining: number) => {
      setSuggestionCount(remaining);
      touch();

      if (originalCaptured.current) return;
      const original = preCorrectionDoc.current;
      if (!original) return;
      originalCaptured.current = true;

      void (async () => {
        const id = autosave.entryId ?? (await autosave.saveNow());
        if (id) await captureOriginal(bookId, id, original);
      })();
    },
    [autosave, bookId, touch],
  );

  function publish(status: "draft" | "published") {
    setError(null);
    const countAtSubmit = changeCount;

    startSaving(async () => {
      const result = await saveEntry({
        bookId,
        entryId: autosave.entryId ?? undefined,
        entryDate,
        title: title.trim() ? title.trim() : null,
        content,
        layout,
        status,
        tags: tagsText
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean)
          .slice(0, 20),
        mood: null,
        location: null,
        sealedUntil: sealed && sealedUntil ? sealedUntil : null,
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      autosave.discardLocal();
      autosave.markSaved(countAtSubmit);
      router.push(`/books/${bookId}`);
      router.refresh();
    });
  }

  function remove() {
    const id = autosave.entryId;
    if (!id) return;
    if (!window.confirm("Delete this entry permanently? This cannot be undone.")) return;

    startSaving(async () => {
      const result = await deleteEntry({ bookId, entryId: id });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      autosave.discardLocal();
      router.push(`/books/${bookId}`);
      router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      {recovered ? (
        <Card className="flex flex-wrap items-center justify-between gap-3 border-brand/40 bg-brand/5">
          <p className="text-sm text-ink-soft">
            An unsaved draft from this device was found. Restore it?
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                autosave.discardLocal();
                setRecoveryDismissed(true);
              }}
            >
              Discard
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setEntryDate(recovered.entryDate as CalendarDate);
                setTitle(recovered.title);
                setContent(recovered.content);
                editorRef.current?.commands.setContent(recovered.content);
                setRecoveryDismissed(true);
                touch();
              }}
            >
              Restore
            </Button>
          </div>
        </Card>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-[13rem_1fr]">
        <Field
          label="Date of this entry"
          htmlFor="entryDate"
          hint={isBackdated ? "Filed under a past date." : "Today in this book."}
        >
          <Input
            id="entryDate"
            type="date"
            value={entryDate}
            max="2999-12-31"
            onChange={(event) => {
              setEntryDate(event.target.value as CalendarDate);
              touch();
            }}
          />
        </Field>

        <Field label="Title" htmlFor="title" hint="Optional.">
          <Input
            id="title"
            value={title}
            maxLength={160}
            onChange={(event) => {
              setTitle(event.target.value);
              touch();
            }}
            placeholder="Leave blank and the date speaks for itself"
          />
        </Field>
      </div>

      {isBackdated ? (
        <p className="rounded-lg border border-rule bg-surface-sunk/60 px-3 py-2 text-xs text-ink-muted">
          This will appear in the book under {formatLongDate(entryDate)}, after anything already
          written on that day.
        </p>
      ) : null}

      {/*
        Writing and arranging are separate modes on purpose: dragging a picture
        and selecting text are the same gesture, so putting handles on a live
        editor makes both worse.
      */}
      <div role="tablist" aria-label="Editing mode" className="flex gap-1 border-b border-rule">
        {(["write", "photos"] as const).map((value) => (
          <button
            key={value}
            role="tab"
            type="button"
            aria-selected={tab === value}
            onClick={() => setTab(value)}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm transition-colors",
              tab === value
                ? "border-ink text-ink"
                : "border-transparent text-ink-muted hover:text-ink",
            )}
          >
            {value === "write"
              ? "Write"
              : `Photos${layout.length > 0 ? ` (${layout.length})` : ""}`}
          </button>
        ))}
      </div>

      {/*
        The editor stays mounted while the Photos tab is open — unmounting it
        would throw away the undo history and the caret position.
      */}
      <div hidden={tab !== "write"}>
        <RichTextEditor
          initialContent={entry?.content ?? EMPTY_DOC}
          placeholder="Good morning…"
          onChange={handleChange}
          onEditorReady={handleEditorReady}
          onSuggestionApplied={handleSuggestionApplied}
          onPasteFiles={(files) => void addPhotos(files)}
          toolbarExtra={
            <>
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => photoInput.current?.click()}
                disabled={uploading}
                title="Put a picture on the page (Ctrl/⌘ + P, or just paste one)"
                className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-ink-muted transition-colors hover:bg-surface-sunk hover:text-ink disabled:opacity-40"
              >
                {uploading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <ImagePlus className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                {uploading ? "Adding…" : "Picture"}
              </button>

              <CopyButton
                doc={content}
                title={title}
                className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-ink-muted transition-colors hover:bg-surface-sunk hover:text-ink"
              />
            </>
          }
          footer={
            layout.length > 0 ? (
              <span>
                {layout.length} {layout.length === 1 ? "photograph" : "photographs"} on these pages
              </span>
            ) : null
          }
          stickers={
            layout.length > 0 ? (
              <>
                <PageStickers items={stickers.behind} urls={mediaUrls} className="z-0" />
                <PageStickers items={stickers.front} urls={mediaUrls} className="z-20" />
              </>
            ) : null
          }
        />

        {/*
          One hidden input, opened by the toolbar button and by Ctrl/⌘ + P. It
          lives outside the editor so that opening the file picker never moves
          the caret.
        */}
        <input
          ref={photoInput}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif,image/heic"
          multiple
          className="sr-only"
          onChange={(event) => {
            const files = event.target.files ? Array.from(event.target.files) : [];
            event.target.value = "";
            void addPhotos(files);
          }}
        />

        {uploadError ? <FormError>{uploadError}</FormError> : null}
      </div>

      {tab === "photos" ? (
        <div className="space-y-4">
          <PhotoArranger
            content={content}
            items={layout}
            urls={mediaUrls}
            selectedId={selectedMediaId}
            onSelect={setSelectedMediaId}
            onChange={(next) => {
              setLayout(next);
              touch();
            }}
            indentParagraphs={indentParagraphs ?? false}
          />

          <PhotoPanel
            bookId={bookId}
            entryId={autosave.entryId}
            items={layout}
            selectedId={selectedMediaId}
            onSelect={setSelectedMediaId}
            onChange={(next) => {
              setLayout(next);
              touch();
            }}
            onAddUrl={(path, url) =>
              setMediaUrls((current) => new Map(current).set(path, url))
            }
          />
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-ink-muted">
        <SaveIndicator status={autosave.status} lastSavedAt={autosave.lastSavedAt} />
        <span>
          {words.toLocaleString()} {words === 1 ? "word" : "words"}
        </span>
      </div>

      <details className="rounded-card border border-rule bg-surface px-4 py-3">
        <summary className="cursor-pointer text-sm text-ink-soft">More options</summary>
        <div className="mt-4 space-y-4">
          <Field label="Tags" htmlFor="tags" hint="Comma separated. Useful for finding things later.">
            <Input
              id="tags"
              value={tagsText}
              onChange={(event) => {
                setTagsText(event.target.value);
                touch();
              }}
              placeholder="travel, hong kong, ferry"
            />
          </Field>

          <div className="space-y-2">
            <Checkbox
              id="sealed"
              label="Seal this letter until a future date"
              checked={sealed}
              onChange={(event) => {
                setSealed(event.target.checked);
                touch();
              }}
            />
            {sealed ? (
              <div className="space-y-1.5 pl-6">
                <Input
                  type="date"
                  aria-label="Opens on"
                  value={sealedUntil}
                  min={bookToday}
                  onChange={(event) => {
                    setSealedUntil(event.target.value);
                    touch();
                  }}
                />
                <p className="flex items-start gap-1.5 text-xs text-ink-muted">
                  <Lock className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
                  Nobody else can read this — not even by querying the database — until that date.
                  You can always read your own.
                </p>
              </div>
            ) : null}
          </div>
        </div>
      </details>

      {tab === "write" ? (
        <SpellingBar
          bookId={bookId}
          doc={content}
          remaining={suggestionCount}
          onSuggestions={handleSuggestions}
          onClear={handleClearSuggestions}
        />
      ) : null}

      {error ? <FormError>{error}</FormError> : null}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-rule pt-5">
        <div>
          {autosave.entryId ? (
            <Button type="button" variant="ghost" size="sm" onClick={remove} disabled={saving}>
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              Delete
            </Button>
          ) : null}
        </div>

        <div className="flex gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={() => publish("draft")}
            disabled={saving}
          >
            Save as draft
          </Button>
          <Button
            type="button"
            onClick={() => publish("published")}
            disabled={saving || plainText.trim().length === 0}
          >
            {saving ? "Saving…" : entry?.status === "published" ? "Save changes" : "Add to the book"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function SaveIndicator({
  status,
  lastSavedAt,
}: {
  status: SaveStatus;
  lastSavedAt: Date | null;
}) {
  // `aria-live="polite"` so a screen-reader user hears "Saved" without the
  // announcement interrupting whatever they are typing.
  return (
    <span className="inline-flex items-center gap-1.5" aria-live="polite">
      {status === "saving" ? (
        <>
          <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
          Saving…
        </>
      ) : null}
      {status === "saved" ? (
        <>
          <Check className="h-3 w-3 text-success" aria-hidden="true" />
          Saved
          {lastSavedAt
            ? ` at ${lastSavedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
            : ""}
        </>
      ) : null}
      {status === "unsaved" ? (
        <>
          <CloudOff className="h-3 w-3" aria-hidden="true" />
          Unsaved changes
        </>
      ) : null}
      {status === "error" ? (
        <span className="inline-flex items-center gap-1.5 text-danger">
          <AlertTriangle className="h-3 w-3" aria-hidden="true" />
          Could not reach the server. Your writing is kept on this device and will be sent again.
        </span>
      ) : null}
    </span>
  );
}

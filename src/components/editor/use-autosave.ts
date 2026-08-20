"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { RichTextDoc } from "@/lib/text/rich-text";

export type SaveStatus = "idle" | "unsaved" | "saving" | "saved" | "error";

export type LocalDraft = {
  entryDate: string;
  title: string;
  content: RichTextDoc;
  savedAt: number;
};

export function localDraftKey(bookId: string, entryId: string | null): string {
  return `journal-letter:draft:${bookId}:${entryId ?? "new"}`;
}

export function readLocalDraft(key: string): LocalDraft | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LocalDraft;
    if (!parsed || typeof parsed !== "object" || !parsed.content) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Autosave that does not lose writing.
 *
 * Two layers, because they fail differently:
 *
 *   * `localStorage` is written on every change. It survives a refresh, a
 *     crashed tab and a flat battery, and needs no network.
 *   * The server save is debounced. It is what actually makes the entry exist
 *     for everybody else.
 *
 * The local copy is only cleared once the server has confirmed the same text,
 * so a failed save always leaves something to recover.
 *
 * Dirtiness is tracked with a counter supplied by the caller rather than a
 * boolean flipped inside an effect. That keeps the "unsaved" state *derived* —
 * there is no `setState` in an effect body anywhere here, so typing never
 * schedules an extra render pass just to update a status label.
 */
export function useAutosave({
  bookId,
  initialEntryId,
  entryDate,
  title,
  content,
  layout,
  drawing,
  changeCount,
  enabled = true,
}: {
  bookId: string;
  initialEntryId: string | null;
  entryDate: string;
  title: string;
  content: RichTextDoc;
  layout: unknown[];
  drawing: unknown[];
  /** Incremented by the caller on every edit. 0 means "untouched". */
  changeCount: number;
  enabled?: boolean;
}) {
  const [entryId, setEntryId] = useState<string | null>(initialEntryId);
  const [savedCount, setSavedCount] = useState(0);
  const [inFlight, setInFlight] = useState(false);
  const [failed, setFailed] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);

  const key = localDraftKey(bookId, initialEntryId);

  // The latest payload, kept in a ref so the debounced save never writes stale
  // text. Assigned in an effect rather than during render — mutating a ref while
  // rendering is not allowed, and this effect is declared first so it always
  // runs before the debounce effect below.
  const latest = useRef({ entryDate, title, content, layout, drawing, entryId, changeCount });
  useEffect(() => {
    latest.current = { entryDate, title, content, layout, drawing, entryId, changeCount };
  });

  const busy = useRef(false);
  const queued = useRef(false);

  /**
   * Returns the entry id, because callers frequently need it *immediately* and
   * `entryId` above is React state, which will not have updated yet.
   */
  const save = useCallback(async (): Promise<string | null> => {
    // Already saving: note that more text arrived and let the running save pick
    // it up on its next pass.
    if (busy.current) {
      queued.current = true;
      return latest.current.entryId;
    }

    busy.current = true;
    setInFlight(true);

    let resultId = latest.current.entryId;

    try {
      // A loop rather than a recursive call. Re-entering `save` from its own
      // `finally` block would also work, but a self-referencing callback cannot
      // be memoised, and this hook runs on every keystroke.
      do {
        queued.current = false;
        const snapshot = latest.current;

        try {
          const response = await fetch("/api/entries/autosave", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              bookId,
              entryId: snapshot.entryId,
              entryDate: snapshot.entryDate,
              title: snapshot.title.trim() ? snapshot.title.trim() : null,
              content: snapshot.content,
              layout: snapshot.layout,
              drawing: snapshot.drawing,
            }),
          });

          if (!response.ok) throw new Error(String(response.status));

          const result = (await response.json()) as {
            entryId: string | null;
            savedAt: string | null;
          };

          if (result.entryId) {
            setEntryId(result.entryId);
            // Keep the ref in step too, so a save firing before React re-renders
            // updates the existing draft instead of creating a second one.
            latest.current.entryId = result.entryId;
          }

          // Only now is it safe to drop the local copy.
          try {
            localStorage.removeItem(key);
          } catch {
            // A stale local draft is harmless.
          }

          resultId = result.entryId ?? snapshot.entryId;
          setFailed(false);
          setSavedCount(snapshot.changeCount);
          setLastSavedAt(result.savedAt ? new Date(result.savedAt) : new Date());
        } catch {
          // Stop retrying immediately; the next keystroke schedules another go,
          // and the local copy still holds the writing.
          setFailed(true);
          queued.current = false;
          resultId = snapshot.entryId;
        }
      } while (queued.current);
    } finally {
      busy.current = false;
      setInFlight(false);
    }

    return resultId;
  }, [bookId, key]);

  // Write the local copy, then debounce the network call.
  useEffect(() => {
    if (!enabled || changeCount === 0) return;

    try {
      const draft: LocalDraft = { entryDate, title, content, savedAt: Date.now() };
      localStorage.setItem(key, JSON.stringify(draft));
    } catch {
      // Quota or private mode. The debounced server save is still coming.
      // Note the local copy holds the writing only: a page of photographs is
      // already safe on the server, and storing image data here would blow the
      // storage quota on the first page.
    }

    const timer = setTimeout(() => void save(), 1500);
    return () => clearTimeout(timer);
  }, [enabled, changeCount, entryDate, title, content, key, save]);

  const isDirty = changeCount !== savedCount;

  // Best-effort flush when the tab is hidden mid-sentence.
  useEffect(() => {
    if (!enabled) return;

    function onVisibilityChange() {
      if (document.visibilityState === "hidden" && latest.current.changeCount !== savedCount) {
        void save();
      }
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [enabled, savedCount, save]);

  // Warn before leaving with work that has not reached the server.
  useEffect(() => {
    if (!enabled) return;

    function onBeforeUnload(event: BeforeUnloadEvent) {
      if (latest.current.changeCount !== savedCount) event.preventDefault();
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [enabled, savedCount]);

  const status: SaveStatus = inFlight
    ? "saving"
    : failed
      ? "error"
      : isDirty && changeCount > 0
        ? "unsaved"
        : savedCount > 0
          ? "saved"
          : "idle";

  const discardLocal = useCallback(() => {
    try {
      localStorage.removeItem(key);
    } catch {
      // Ignore.
    }
  }, [key]);

  /** Marks the current text as saved, after an explicit publish. */
  const markSaved = useCallback((count: number) => {
    setSavedCount(count);
    setFailed(false);
  }, []);

  /**
   * Take ownership of an entry created elsewhere — by the Save or Publish
   * button, which goes through a Server Action rather than through here.
   *
   * Without this, autosave still believes there is no entry yet, and the next
   * save it makes *inserts a second one*. That is the duplicate letters: press
   * "Add to the book" within a second or so of typing, and the debounced save
   * already in flight lands afterwards and creates a draft copy of the letter
   * that was just published.
   *
   * The ref is written as well as the state, because a save can fire before
   * React has re-rendered and would otherwise read the stale `null`.
   */
  const adopt = useCallback((id: string) => {
    setEntryId(id);
    latest.current.entryId = id;
  }, []);

  return {
    entryId,
    status,
    lastSavedAt,
    saveNow: save,
    discardLocal,
    markSaved,
    adopt,
    localKey: key,
  };
}

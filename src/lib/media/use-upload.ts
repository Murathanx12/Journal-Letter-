"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { formatBytes, prepareImage } from "./optimise";
import { DEFAULT_PLACEMENT, type PlacedMedia } from "./placement";

/**
 * Putting photographs into a book.
 *
 * Shared by every route a picture can take in — the toolbar button, Ctrl/⌘ + P,
 * a paste, a drag and drop, and the Photos panel — because they all mean the
 * same thing and differ only in how the file arrived.
 *
 * Each file is shrunk and re-encoded in the browser first (see `prepareImage`),
 * which is what makes putting a dozen holiday photographs in a letter from a
 * phone a reasonable thing to do. The dimensions of the *uploaded* version are
 * sent along, so the server never decodes the file to learn its shape and a
 * picture is never rendered squashed while that is worked out.
 */

/** Rejected before decoding: no photograph anybody writes with is this large. */
const MAX_SOURCE_BYTES = 60 * 1024 * 1024;

export type UploadedImage = {
  attachmentId: string;
  path: string;
  /** Signed URL, good for about an hour. Null if signing failed. */
  url: string | null;
  width: number | null;
  height: number | null;
};

export type UploadProgress = {
  /** How many files have finished, of how many were given. */
  done: number;
  total: number;
};

export type UploadResult = {
  images: UploadedImage[];
  /** Sticker placements for the same pictures, for the scrapbook panel. */
  placed: PlacedMedia[];
  /** Signed URLs keyed by storage path. */
  urls: [string, string][];
};

const EMPTY: UploadResult = { images: [], placed: [], urls: [] };

type UploadResponse = { id: string; path: string; url: string | null };

/**
 * One upload. Every failure — a rejected file, a 500, a dropped connection —
 * comes back as a message rather than as a thrown error, so one bad photograph
 * out of ten does not abandon the other nine.
 */
async function send(form: FormData): Promise<UploadResponse | { error: string }> {
  try {
    const response = await fetch("/api/attachments/upload", { method: "POST", body: form });
    const body: unknown = await response.json();

    if (body && typeof body === "object" && "error" in body) {
      return { error: String((body as { error: unknown }).error) };
    }
    if (!response.ok) return { error: "Could not upload that picture." };

    return body as UploadResponse;
  } catch {
    return { error: "That picture could not be sent. Check your connection and try again." };
  }
}

export function useMediaUpload({
  bookId,
  entryId,
  /** Where new stickers land. Usually the page currently being looked at. */
  page = 0,
}: {
  bookId: string;
  entryId: string | null;
  page?: number;
}) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  /**
   * The entry id can be created by an autosave *while* an upload is in flight,
   * so it is read from a ref at the moment each request is sent rather than
   * captured when the callback was made.
   */
  const latestEntryId = useRef(entryId);
  // Assigned in an effect rather than during render — mutating a ref while
  // rendering is not allowed, and this runs before any upload could read it.
  useEffect(() => {
    latestEntryId.current = entryId;
  }, [entryId]);

  const upload = useCallback(
    async (files: readonly File[]): Promise<UploadResult> => {
      const chosen = files.slice(0, 10);
      if (chosen.length === 0) return EMPTY;

      setError(null);
      setUploading(true);
      setProgress({ done: 0, total: chosen.length });

      const images: UploadedImage[] = [];
      const placed: PlacedMedia[] = [];
      const urls: [string, string][] = [];

      try {
        for (const original of chosen) {
          if (original.size > MAX_SOURCE_BYTES) {
            setError(
              `That picture is ${formatBytes(original.size)}, which is larger than this can handle.`,
            );
            setProgress((current) => (current ? { ...current, done: current.done + 1 } : current));
            continue;
          }

          const prepared = await prepareImage(original);

          const form = new FormData();
          form.set("bookId", bookId);
          if (latestEntryId.current) form.set("entryId", latestEntryId.current);
          form.set("file", prepared.file);
          if (prepared.width && prepared.height) {
            form.set("width", String(prepared.width));
            form.set("height", String(prepared.height));
          }

          const uploaded = await send(form);

          setProgress((current) => (current ? { ...current, done: current.done + 1 } : current));

          if ("error" in uploaded) {
            setError(uploaded.error);
            continue;
          }
          const result = uploaded;

          if (result.url) urls.push([result.path, result.url]);

          images.push({
            attachmentId: result.id,
            path: result.path,
            url: result.url,
            width: prepared.width,
            height: prepared.height,
          });

          placed.push({
            ...DEFAULT_PLACEMENT,
            id: crypto.randomUUID(),
            attachmentId: result.id,
            path: result.path,
            aspect: prepared.width && prepared.height ? prepared.height / prepared.width : 1,
            page,
            // Stagger, so several at once do not land exactly on top of each other.
            x: DEFAULT_PLACEMENT.x + placed.length * 0.05,
            y: DEFAULT_PLACEMENT.y + placed.length * 0.06,
          });
        }
      } finally {
        setUploading(false);
        setProgress(null);
      }

      return { images, placed, urls };
    },
    [bookId, page],
  );

  return { upload, uploading, progress, error, setError };
}

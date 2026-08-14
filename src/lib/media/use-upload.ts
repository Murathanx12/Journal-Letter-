"use client";

import { useCallback, useState } from "react";

import { DEFAULT_PLACEMENT, type PlacedMedia } from "./placement";

/**
 * Putting photographs onto a page.
 *
 * Shared by the "Add photos" button, Ctrl/⌘ + P and pasting an image, because
 * all three mean the same thing and only differ in how the file arrived.
 *
 * Image dimensions are read in the browser before upload and sent along, so the
 * server never has to decode the file to learn its aspect ratio — and a picture
 * is never rendered squashed while it waits for that to be worked out.
 */

async function readImageSize(file: File): Promise<{ width: number; height: number } | null> {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("decode failed"));
      image.src = url;
    });
    return { width: image.naturalWidth, height: image.naturalHeight };
  } catch {
    // HEIC and some exotic formats will not decode in every browser. The upload
    // still works; the picture just starts square until it is resized.
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export type UploadResult = {
  placed: PlacedMedia[];
  /** Signed URLs for the new photographs, keyed by storage path. */
  urls: [string, string][];
};

export function useMediaUpload({
  bookId,
  entryId,
  /** Where new photographs land. Usually the page currently being looked at. */
  page = 0,
}: {
  bookId: string;
  entryId: string | null;
  page?: number;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upload = useCallback(
    async (files: readonly File[]): Promise<UploadResult> => {
      setError(null);
      setUploading(true);

      const placed: PlacedMedia[] = [];
      const urls: [string, string][] = [];

      try {
        for (const file of files.slice(0, 10)) {
          const size = await readImageSize(file);

          const form = new FormData();
          form.set("bookId", bookId);
          if (entryId) form.set("entryId", entryId);
          form.set("file", file);
          if (size) {
            form.set("width", String(size.width));
            form.set("height", String(size.height));
          }

          const response = await fetch("/api/attachments/upload", { method: "POST", body: form });
          const result = (await response.json()) as
            | { id: string; path: string; url: string | null }
            | { error: string };

          if (!response.ok || "error" in result) {
            setError("error" in result ? result.error : "Could not upload that image.");
            continue;
          }

          if (result.url) urls.push([result.path, result.url]);

          placed.push({
            ...DEFAULT_PLACEMENT,
            id: crypto.randomUUID(),
            attachmentId: result.id,
            path: result.path,
            aspect: size ? size.height / size.width : 1,
            page,
            // Stagger, so several at once do not land exactly on top of each other.
            x: DEFAULT_PLACEMENT.x + placed.length * 0.05,
            y: DEFAULT_PLACEMENT.y + placed.length * 0.06,
          });
        }
      } finally {
        setUploading(false);
      }

      return { placed, urls };
    },
    [bookId, entryId, page],
  );

  return { upload, uploading, error, setError };
}

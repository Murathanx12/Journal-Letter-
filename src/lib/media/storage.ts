import "server-only";

import { createClient } from "@/lib/supabase/server";

/**
 * Reading private media.
 *
 * `book-media` is not a public bucket, so nothing renders from a plain URL.
 * Every image is served through a signed URL that expires, and signing is only
 * possible for someone whose session already passes the storage policies — the
 * same book membership that guards the writing.
 */

export const MEDIA_BUCKET = "book-media";

/** An hour: long enough to read or edit, short enough that a leaked URL dies. */
const SIGNED_URL_TTL_SECONDS = 60 * 60;

export async function signMediaPaths(paths: readonly string[]): Promise<Map<string, string>> {
  const unique = [...new Set(paths)].filter(Boolean);
  const signed = new Map<string, string>();
  if (unique.length === 0) return signed;

  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from(MEDIA_BUCKET)
    .createSignedUrls(unique, SIGNED_URL_TTL_SECONDS);

  // A failure here means a missing file or a policy refusal. Either way the
  // page should still render, just without that picture.
  if (error || !data) return signed;

  for (const entry of data) {
    if (entry.signedUrl && entry.path) signed.set(entry.path, entry.signedUrl);
  }

  return signed;
}

export const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
] as const;

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/** Extension for a storage key. Never taken from the client's filename. */
export function extensionForMimeType(mimeType: string): string {
  switch (mimeType) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    case "image/heic":
      return "heic";
    default:
      return "bin";
  }
}

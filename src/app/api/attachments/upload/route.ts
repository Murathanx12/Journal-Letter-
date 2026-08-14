import { randomUUID } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { getSessionUser } from "@/lib/auth/session";
import {
  ALLOWED_IMAGE_TYPES,
  MAX_UPLOAD_BYTES,
  MEDIA_BUCKET,
  extensionForMimeType,
} from "@/lib/media/storage";
import { createClient } from "@/lib/supabase/server";

/**
 * Uploading a photograph.
 *
 * The storage key is built here, never taken from the client: it always starts
 * with the book's id, because the `storage.objects` policies authorize from
 * that first path segment. A client-supplied path could otherwise write into
 * somebody else's book.
 *
 * The filename itself is discarded entirely and replaced with a random id —
 * original filenames leak things ("scan-of-divorce-papers.jpg") and are a
 * traversal risk.
 */

export const runtime = "nodejs";
export const maxDuration = 60;

const fieldsSchema = z.object({
  bookId: z.uuid(),
  entryId: z.uuid().nullable(),
  width: z.coerce.number().int().min(1).max(30000).nullable(),
  height: z.coerce.number().int().min(1).max(30000).nullable(),
});

export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Malformed upload." }, { status: 400 });
  }

  const parsed = fieldsSchema.safeParse({
    bookId: form.get("bookId"),
    entryId: form.get("entryId") || null,
    width: form.get("width") || null,
    height: form.get("height") || null,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Malformed upload." }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file was sent." }, { status: 400 });
  }

  if (!ALLOWED_IMAGE_TYPES.includes(file.type as (typeof ALLOWED_IMAGE_TYPES)[number])) {
    return NextResponse.json(
      { error: "That file type is not supported. Use a JPEG, PNG, WebP, GIF or HEIC." },
      { status: 415 },
    );
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: "That image is larger than 10 MB. Try a smaller version." },
      { status: 413 },
    );
  }

  const { bookId, entryId, width, height } = parsed.data;
  const supabase = await createClient();

  // Writing membership, checked before touching storage. The storage policies
  // enforce this too; failing here just gives a better message.
  const { data: canWrite } = await supabase.rpc("can_write_book", { p_book_id: bookId });
  if (!canWrite) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const storagePath = `${bookId}/${randomUUID()}.${extensionForMimeType(file.type)}`;

  const { error: uploadError } = await supabase.storage
    .from(MEDIA_BUCKET)
    .upload(storagePath, file, { contentType: file.type, upsert: false });

  if (uploadError) {
    return NextResponse.json({ error: "Could not upload that image." }, { status: 500 });
  }

  const { data: attachment, error: rowError } = await supabase
    .from("attachments")
    .insert({
      book_id: bookId,
      entry_id: entryId,
      uploader_id: user.id,
      storage_path: storagePath,
      mime_type: file.type,
      byte_size: file.size,
      width,
      height,
    })
    .select("id, storage_path, width, height")
    .single();

  if (rowError || !attachment) {
    // Do not leave a file with no record of it behind.
    await supabase.storage.from(MEDIA_BUCKET).remove([storagePath]);
    return NextResponse.json({ error: "Could not save that image." }, { status: 500 });
  }

  const { data: signed } = await supabase.storage
    .from(MEDIA_BUCKET)
    .createSignedUrl(storagePath, 60 * 60);

  return NextResponse.json({
    id: attachment.id,
    path: attachment.storage_path,
    url: signed?.signedUrl ?? null,
    width: attachment.width,
    height: attachment.height,
  });
}

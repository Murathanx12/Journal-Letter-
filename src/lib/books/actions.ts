"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { describeDatabaseError, fail, ok, type ActionResult } from "@/lib/actions/result";
import { requireUser } from "@/lib/auth/session";
import { serverEnv } from "@/lib/env";
import { generateInvitationToken, hashInvitationToken, invitationUrl } from "@/lib/invitations/tokens";
import { createClient } from "@/lib/supabase/server";
import {
  createBookSchema,
  fieldErrors,
  updateBookSchema,
  type CreateBookInput,
} from "@/lib/validation/schemas";
import type { BookCover, BookDesign } from "@/lib/design/theme";

/**
 * Book mutations.
 *
 * Each action re-validates its input and then relies on RLS for authorization.
 * There is no `if (user.id === book.owner_id)` check here that Postgres is not
 * already making — a bug in this file cannot widen access, it can only produce
 * a worse error message.
 */

export type CreatedBook = { bookId: string; inviteUrl: string | null };

export async function createBook(input: CreateBookInput): Promise<ActionResult<CreatedBook>> {
  const user = await requireUser();

  const parsed = createBookSchema.safeParse(input);
  if (!parsed.success) {
    return fail("Please check the details below.", fieldErrors(parsed.error));
  }
  const values = parsed.data;

  const supabase = await createClient();

  const cover: BookCover = { preset: values.coverPreset as BookCover["preset"], imagePath: null };
  const design: Partial<BookDesign> = { preset: values.designPreset as BookDesign["preset"] };

  const { data: book, error } = await supabase
    .from("books")
    .insert({
      owner_id: user.id,
      type: values.type,
      title: values.title,
      subtitle: values.subtitle ?? null,
      description: values.description ?? null,
      timezone: values.timezone,
      cover,
      design,
    })
    .select("id")
    .single();

  if (error || !book) return fail(describeDatabaseError(error));

  // Inviting during creation is optional, and a failure here must not lose the
  // book the user just made — report it, keep the book.
  let inviteUrl: string | null = null;
  if (values.type === "shared_letter_book" && values.inviteEmail) {
    const token = generateInvitationToken();
    const { error: inviteError } = await supabase.from("book_invitations").insert({
      book_id: book.id,
      invited_email: values.inviteEmail,
      role: "editor",
      token_hash: hashInvitationToken(token),
      created_by: user.id,
    });
    if (!inviteError) inviteUrl = invitationUrl(serverEnv.siteUrl, token);
  }

  revalidatePath("/library");
  return ok({ bookId: book.id, inviteUrl });
}

export async function updateBook(input: unknown): Promise<ActionResult> {
  await requireUser();

  const parsed = updateBookSchema.safeParse(input);
  if (!parsed.success) {
    return fail("Please check the details below.", fieldErrors(parsed.error));
  }
  const values = parsed.data;

  const supabase = await createClient();

  // Preserve any uploaded cover image while the preset changes around it.
  const { data: existing } = await supabase
    .from("books")
    .select("cover")
    .eq("id", values.bookId)
    .maybeSingle();

  const existingImagePath =
    existing?.cover && typeof existing.cover === "object" && !Array.isArray(existing.cover)
      ? ((existing.cover as Record<string, unknown>).imagePath as string | null | undefined) ?? null
      : null;

  const cover: BookCover = {
    preset: values.coverPreset as BookCover["preset"],
    imagePath: existingImagePath,
  };

  const design: BookDesign = {
    preset: values.designPreset as BookDesign["preset"],
    bodyFont: (values.bodyFont as BookDesign["bodyFont"]) ?? null,
    headingFont: (values.headingFont as BookDesign["headingFont"]) ?? null,
    baseSize: values.baseSize,
    lineHeight: values.lineHeight,
    titleSize: values.titleSize,
    titleWeight: values.titleWeight,
    perAuthorFonts: values.perAuthorFonts,
    showSignatures: values.showSignatures,
    pageSize: values.pageSize,
  };

  const { error } = await supabase
    .from("books")
    .update({
      title: values.title,
      subtitle: values.subtitle,
      description: values.description,
      timezone: values.timezone,
      cover,
      design,
    })
    .eq("id", values.bookId);

  if (error) return fail(describeDatabaseError(error));

  revalidatePath(`/books/${values.bookId}`, "layout");
  revalidatePath("/library");
  return ok();
}

export async function setBookArchived(bookId: string, archived: boolean): Promise<ActionResult> {
  await requireUser();

  const supabase = await createClient();
  const { error } = await supabase
    .from("books")
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq("id", bookId);

  if (error) return fail(describeDatabaseError(error));

  revalidatePath("/library");
  revalidatePath(`/books/${bookId}`, "layout");
  return ok();
}

/**
 * Permanent. Entries, versions, attachments, invitations and memberships all
 * cascade. The confirmation lives in the UI; this only guards against a
 * mis-click by requiring the exact title to be typed back.
 */
export async function deleteBook(bookId: string, confirmTitle: string): Promise<ActionResult> {
  await requireUser();

  const supabase = await createClient();

  const { data: book } = await supabase
    .from("books")
    .select("title")
    .eq("id", bookId)
    .maybeSingle();

  if (!book) return fail("That book could not be found.");
  if (book.title.trim() !== confirmTitle.trim()) {
    return fail("The title you typed does not match, so nothing was deleted.");
  }

  // Storage objects are not covered by the database cascade, so clear them
  // first. If this fails the book still deletes; orphaned files are recoverable,
  // a half-deleted book is not.
  const { data: files } = await supabase.storage.from("book-media").list(bookId, { limit: 1000 });
  if (files && files.length > 0) {
    await supabase.storage
      .from("book-media")
      .remove(files.map((file) => `${bookId}/${file.name}`));
  }

  const { error } = await supabase.from("books").delete().eq("id", bookId);
  if (error) return fail(describeDatabaseError(error));

  revalidatePath("/library");
  redirect("/library");
}

/** Leave a shared book. Owners must transfer or delete instead. */
export async function leaveBook(bookId: string): Promise<ActionResult> {
  const user = await requireUser();

  const supabase = await createClient();
  const { error } = await supabase
    .from("book_members")
    .delete()
    .eq("book_id", bookId)
    .eq("user_id", user.id);

  if (error) return fail(describeDatabaseError(error));

  revalidatePath("/library");
  redirect("/library");
}

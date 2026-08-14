"use server";

import { revalidatePath } from "next/cache";

import { describeDatabaseError, fail, ok, type ActionResult } from "@/lib/actions/result";
import { requireUser } from "@/lib/auth/session";
import { serverEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import {
  changeRoleSchema,
  createInvitationSchema,
  fieldErrors,
  memberActionSchema,
  revokeInvitationSchema,
} from "@/lib/validation/schemas";

import { generateInvitationToken, hashInvitationToken, invitationUrl } from "./tokens";

/**
 * Sharing is invitation-based, never "publish a public link". Two safeguards
 * make that real:
 *
 *   * an invitation carries a 256-bit token that exists only in the URL, and
 *     the database keeps only its hash;
 *   * accepting requires a signed-in account, and — when the invitation names
 *     an email — that account's own verified email must match.
 */

export type CreatedInvitation = { url: string; email: string | null };

export async function createInvitation(input: unknown): Promise<ActionResult<CreatedInvitation>> {
  const user = await requireUser();

  const parsed = createInvitationSchema.safeParse(input);
  if (!parsed.success) {
    return fail("Please check the details below.", fieldErrors(parsed.error));
  }
  const { bookId, email, role, expiresInDays } = parsed.data;

  const supabase = await createClient();

  const token = generateInvitationToken();
  const expiresAt = new Date(Date.now() + expiresInDays * 86_400_000).toISOString();

  const { error } = await supabase.from("book_invitations").insert({
    book_id: bookId,
    invited_email: email,
    role,
    token_hash: hashInvitationToken(token),
    created_by: user.id,
    expires_at: expiresAt,
  });

  if (error) return fail(describeDatabaseError(error));

  revalidatePath(`/books/${bookId}/members`);

  // The raw token is returned exactly once, here. It is not recoverable later —
  // if the link is lost, the owner revokes and issues a new one.
  return ok({ url: invitationUrl(serverEnv.siteUrl, token), email });
}

export async function revokeInvitation(input: unknown): Promise<ActionResult> {
  await requireUser();

  const parsed = revokeInvitationSchema.safeParse(input);
  if (!parsed.success) return fail("That invitation could not be identified.");

  const supabase = await createClient();
  const { error } = await supabase
    .from("book_invitations")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", parsed.data.invitationId)
    .eq("book_id", parsed.data.bookId);

  if (error) return fail(describeDatabaseError(error));

  revalidatePath(`/books/${parsed.data.bookId}/members`);
  return ok();
}

export type InvitationPreview = {
  status:
    | "valid"
    | "expired"
    | "revoked"
    | "accepted"
    | "not_found"
    | "wrong_email"
    | "already_member";
  bookTitle: string | null;
  bookSubtitle: string | null;
  inviterName: string | null;
  role: "owner" | "editor" | "viewer" | null;
};

export async function previewInvitation(token: string): Promise<InvitationPreview> {
  await requireUser();

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("invitation_preview", { p_token: token });

  const row = data?.[0];
  if (error || !row) {
    return { status: "not_found", bookTitle: null, bookSubtitle: null, inviterName: null, role: null };
  }

  return {
    status: row.status as InvitationPreview["status"],
    bookTitle: row.book_title,
    bookSubtitle: row.book_subtitle,
    inviterName: row.inviter_name,
    role: row.role,
  };
}

export async function acceptInvitation(token: string): Promise<ActionResult<{ bookId: string }>> {
  await requireUser();

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("accept_invitation", { p_token: token });

  if (error) {
    // These come from explicit RAISE statements in `accept_invitation`, so they
    // are safe to surface — none of them reveals anything about the book.
    switch (error.message) {
      case "invitation_expired":
        return fail("That invitation has expired. Ask for a new one.");
      case "invitation_revoked":
        return fail("That invitation was withdrawn.");
      case "invitation_already_used":
        return fail("That invitation has already been used.");
      case "invitation_wrong_email":
        return fail("That invitation was sent to a different email address.");
      case "invitation_not_found":
        return fail("That invitation could not be found.");
      default:
        return fail(describeDatabaseError(error));
    }
  }

  if (!data) return fail("That invitation could not be found.");

  revalidatePath("/library");
  return ok({ bookId: data });
}

export async function removeMember(input: unknown): Promise<ActionResult> {
  await requireUser();

  const parsed = memberActionSchema.safeParse(input);
  if (!parsed.success) return fail("That member could not be identified.");

  const supabase = await createClient();
  const { error } = await supabase
    .from("book_members")
    .delete()
    .eq("book_id", parsed.data.bookId)
    .eq("user_id", parsed.data.userId);

  if (error) return fail(describeDatabaseError(error));

  revalidatePath(`/books/${parsed.data.bookId}/members`);
  return ok();
}

export async function changeMemberRole(input: unknown): Promise<ActionResult> {
  await requireUser();

  const parsed = changeRoleSchema.safeParse(input);
  if (!parsed.success) return fail("That member could not be identified.");

  const supabase = await createClient();
  const { error } = await supabase
    .from("book_members")
    .update({ role: parsed.data.role })
    .eq("book_id", parsed.data.bookId)
    .eq("user_id", parsed.data.userId);

  if (error) return fail(describeDatabaseError(error));

  revalidatePath(`/books/${parsed.data.bookId}/members`);
  return ok();
}

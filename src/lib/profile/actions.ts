"use server";

import { revalidatePath } from "next/cache";

import { describeDatabaseError, fail, ok, type ActionResult } from "@/lib/actions/result";
import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { fieldErrors, updateProfileSchema } from "@/lib/validation/schemas";

export async function updateProfile(input: unknown): Promise<ActionResult> {
  const user = await requireUser();

  const parsed = updateProfileSchema.safeParse(input);
  if (!parsed.success) {
    return fail("Please check the details below.", fieldErrors(parsed.error));
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({
      display_name: parsed.data.displayName,
      signature: parsed.data.signature,
      preferred_font: parsed.data.preferredFont,
      accent: parsed.data.accent,
    })
    .eq("id", user.id);

  if (error) return fail(describeDatabaseError(error));

  revalidatePath("/settings/profile");
  revalidatePath("/library");
  return ok();
}

/**
 * "Export my data" — everything this account has written, as one JSON file.
 *
 * Scoped by RLS like every other read, so it contains the user's own books and
 * the shared books they belong to, and nothing else.
 */
export async function exportMyData(): Promise<ActionResult<{ json: string }>> {
  const user = await requireUser();
  const supabase = await createClient();

  const [{ data: profile }, { data: books }, { data: entries }, { data: memberships }] =
    await Promise.all([
      supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
      supabase.from("books").select("*"),
      supabase
        .from("entries")
        .select(
          "id, book_id, author_id, entry_date, within_day_order, title, content, plain_text, original_content, original_plain_text, correction_state, tags, mood, location, sealed_until, status, created_at, updated_at",
        )
        .order("entry_date", { ascending: true }),
      supabase.from("book_members").select("book_id, user_id, role, joined_at"),
    ]);

  const payload = {
    exportedAt: new Date().toISOString(),
    account: { id: user.id, email: user.email },
    profile,
    books,
    memberships,
    entries,
  };

  return ok({ json: JSON.stringify(payload, null, 2) });
}

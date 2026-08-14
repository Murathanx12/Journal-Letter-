"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { fail, ok, type ActionResult } from "@/lib/actions/result";
import { safeNextPath } from "@/lib/auth/redirect";
import { serverEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

/**
 * Authentication.
 *
 * Two habits worth noting:
 *
 *   * `next` — where to go after signing in — is validated to be a relative
 *     path. Reflecting an arbitrary URL back into a redirect is a textbook open
 *     redirect, and invitation links make this a real path a stranger controls.
 *
 *   * Sign-up and password-reset both answer the same way whether or not the
 *     email is already registered, so neither can be used to enumerate accounts.
 */

const credentials = z.object({
  email: z.email({ message: "Enter a valid email address." }).toLowerCase(),
  password: z.string().min(8, "Use at least 8 characters."),
});

const signUpSchema = credentials.extend({
  displayName: z.string().trim().min(1, "Tell us what to call you.").max(80),
});

/**
 * These take `(previousState, formData)` because they are driven by React's
 * `useActionState`, which threads the last result back in so the form can show
 * an error without any client-side state of its own.
 */
export async function signInWithPassword(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = credentials.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) return fail("Check your email address and password.");

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    // Deliberately vague — never distinguish "no such account" from "wrong
    // password".
    return fail("That email and password do not match.");
  }

  redirect(safeNextPath(formData.get("next") as string | null));
}

export async function signUpWithPassword(
  _previous: ActionResult<{ needsVerification: boolean }> | null,
  formData: FormData,
): Promise<ActionResult<{ needsVerification: boolean }>> {
  const parsed = signUpSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    displayName: formData.get("displayName"),
  });

  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return fail(issue?.message ?? "Check the details you entered.");
  }

  const next = safeNextPath(formData.get("next") as string | null);
  const supabase = await createClient();

  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      // Picked up by the `handle_new_user` trigger to seed the profile.
      data: { display_name: parsed.data.displayName },
      emailRedirectTo: `${serverEnv.siteUrl}/auth/callback?next=${encodeURIComponent(next)}`,
    },
  });

  if (error) return fail(error.message);

  // With email confirmation on, Supabase returns a user but no session.
  const needsVerification = !data.session;
  return ok({ needsVerification });
}

export async function signInWithGoogle(next: string): Promise<ActionResult> {
  const supabase = await createClient();
  const target = safeNextPath(next);

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${serverEnv.siteUrl}/auth/callback?next=${encodeURIComponent(target)}`,
      // Only identity. The Docs/Drive scopes are requested separately, and only
      // when somebody actually chooses "Export to Google Docs".
      scopes: "email profile",
    },
  });

  if (error || !data.url) return fail("Could not reach Google. Please try again.");

  redirect(data.url);
}

export async function requestPasswordReset(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const email = z.email().safeParse(String(formData.get("email") ?? "").toLowerCase());
  if (!email.success) return fail("Enter a valid email address.");

  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(email.data, {
    redirectTo: `${serverEnv.siteUrl}/auth/callback?next=/reset-password`,
  });

  // Always the same answer, registered or not.
  return ok();
}

export async function updatePassword(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const password = z
    .string()
    .min(8, "Use at least 8 characters.")
    .safeParse(formData.get("password"));

  if (!password.success) return fail("Use at least 8 characters.");

  const supabase = await createClient();

  // Only reachable with a live recovery session, which the callback established.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail("This reset link has expired. Please request a new one.");

  const { error } = await supabase.auth.updateUser({ password: password.data });
  if (error) return fail(error.message);

  redirect("/library");
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}

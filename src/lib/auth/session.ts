import "server-only";

import { redirect } from "next/navigation";
import { cache } from "react";

import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/supabase/database.types";

export type Profile = Tables<"profiles">;

export type SessionUser = {
  id: string;
  email: string | null;
  profile: Profile;
};

/**
 * The authenticated user plus their profile, or null.
 *
 * `cache` dedupes this across a single render pass, so a layout, a page and
 * three components can each ask for the current user without three round trips.
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = await createClient();

  // `getUser()` revalidates the token with Supabase. Never trust `getSession()`
  // for authorization — its contents come straight from a cookie.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile) {
    // The `handle_new_user` trigger creates this row. If it is somehow missing
    // (e.g. a user created before the trigger existed), heal it here rather
    // than crashing the whole app.
    const fallbackName = user.email?.split("@")[0] ?? "Writer";
    const { data: created } = await supabase
      .from("profiles")
      .upsert({ id: user.id, display_name: fallbackName }, { onConflict: "id" })
      .select("*")
      .single();

    if (!created) return null;
    return { id: user.id, email: user.email ?? null, profile: created };
  }

  return { id: user.id, email: user.email ?? null, profile };
});

/** Use in any private page/layout. Redirects to login, preserving the target. */
export async function requireUser(nextPath?: string): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) {
    redirect(nextPath ? `/login?next=${encodeURIComponent(nextPath)}` : "/login");
  }
  return user;
}

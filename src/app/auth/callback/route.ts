import { NextResponse, type NextRequest } from "next/server";

import { safeNextPath } from "@/lib/auth/redirect";
import { createClient } from "@/lib/supabase/server";

/**
 * The one place a sign-in link becomes a session.
 *
 * Handles all three arrivals:
 *   * OAuth (`?code=`) — Google sends the reader back here.
 *   * Email confirmation and recovery (`?token_hash=&type=`).
 *   * Failure (`?error=`) — surfaced as a message, never a blank page.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const next = safeNextPath(searchParams.get("next"));

  const error = searchParams.get("error_description") ?? searchParams.get("error");
  if (error) {
    const url = new URL("/login", origin);
    url.searchParams.set("error", error);
    return NextResponse.redirect(url);
  }

  const supabase = await createClient();

  const code = searchParams.get("code");
  if (code) {
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
    if (!exchangeError) return NextResponse.redirect(new URL(next, origin));
  }

  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  if (tokenHash && type) {
    const { error: verifyError } = await supabase.auth.verifyOtp({
      type: type as "email" | "recovery" | "invite" | "email_change",
      token_hash: tokenHash,
    });
    if (!verifyError) return NextResponse.redirect(new URL(next, origin));
  }

  const url = new URL("/login", origin);
  url.searchParams.set("error", "That link has expired or has already been used.");
  return NextResponse.redirect(url);
}

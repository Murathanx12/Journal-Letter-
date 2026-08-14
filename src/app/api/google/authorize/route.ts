import { randomBytes } from "node:crypto";

import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

import { getSessionUser } from "@/lib/auth/session";
import { serverEnv } from "@/lib/env";
import { GOOGLE_EXPORT_COOKIE } from "@/lib/export/google-cookie";
import { googleAuthUrl } from "@/lib/export/google-docs";

/**
 * Start the Google Docs export.
 *
 * Drive permission is requested here — at the moment somebody chooses this
 * export — and never during ordinary sign-in. Signing in with Google should not
 * ask anybody for access to their Drive.
 *
 * The export parameters ride in a short-lived httpOnly cookie rather than in
 * `state`, so a crafted callback URL cannot make somebody export a different
 * book. `state` carries only a random nonce, which the callback matches against
 * the cookie to reject cross-site requests.
 */

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.redirect(new URL("/login", request.nextUrl.origin));

  if (!serverEnv.googleDocsClientId || !serverEnv.googleDocsClientSecret) {
    return NextResponse.json(
      { error: "Google Docs export has not been configured on this deployment." },
      { status: 503 },
    );
  }

  const params = request.nextUrl.searchParams;
  const bookId = params.get("bookId");
  if (!bookId) return NextResponse.json({ error: "Missing book." }, { status: 400 });

  const nonce = randomBytes(16).toString("base64url");
  const payload = {
    nonce,
    bookId,
    textVersion: params.get("textVersion") === "original" ? "original" : "current",
    from: params.get("from"),
    to: params.get("to"),
    includeCover: params.get("includeCover") !== "0",
  };

  const store = await cookies();
  store.set(GOOGLE_EXPORT_COOKIE, JSON.stringify(payload), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });

  const redirectUri = `${serverEnv.siteUrl}/api/google/callback`;
  return NextResponse.redirect(googleAuthUrl(redirectUri, nonce));
}

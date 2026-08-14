import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

import { getSessionUser } from "@/lib/auth/session";
import { isCalendarDate, type CalendarDate } from "@/lib/date/calendar-date";
import { serverEnv } from "@/lib/env";
import { compileBookForExport } from "@/lib/export/compile";
import { renderBookDocx } from "@/lib/export/docx";
import { GOOGLE_EXPORT_COOKIE } from "@/lib/export/google-cookie";
import { exchangeCodeForToken, uploadDocxAsGoogleDoc } from "@/lib/export/google-docs";
import { createClient } from "@/lib/supabase/server";

/**
 * Finish the Google Docs export.
 *
 * The access token is used once, here, and never stored — we asked for
 * `access_type=online` precisely so there is no refresh token to keep. When
 * this handler returns, the application holds no Google credentials at all.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type ExportState = {
  nonce: string;
  bookId: string;
  textVersion: "original" | "current";
  from: string | null;
  to: string | null;
  includeCover: boolean;
};

function failure(origin: string, bookId: string | null, message: string) {
  const url = new URL(bookId ? `/books/${bookId}/export` : "/library", origin);
  url.searchParams.set("googleError", message);
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest) {
  const { origin, searchParams } = request.nextUrl;

  const user = await getSessionUser();
  if (!user) return NextResponse.redirect(new URL("/login", origin));

  const store = await cookies();
  const raw = store.get(GOOGLE_EXPORT_COOKIE)?.value;
  // Single use, whatever happens next.
  store.delete(GOOGLE_EXPORT_COOKIE);

  if (!raw) return failure(origin, null, "That export request expired. Please try again.");

  let state: ExportState;
  try {
    state = JSON.parse(raw) as ExportState;
  } catch {
    return failure(origin, null, "That export request could not be read.");
  }

  if (searchParams.get("error")) {
    return failure(origin, state.bookId, "Google access was declined.");
  }

  // CSRF: the nonce Google echoes back must match the one we issued.
  if (searchParams.get("state") !== state.nonce) {
    return failure(origin, state.bookId, "That export request could not be verified.");
  }

  const code = searchParams.get("code");
  if (!code) return failure(origin, state.bookId, "Google did not return an authorisation code.");

  // Re-check membership: the cookie is ours, but the session may have changed.
  const supabase = await createClient();
  const { data: isMember } = await supabase.rpc("is_book_member", { p_book_id: state.bookId });
  if (!isMember) return failure(origin, null, "That book could not be found.");

  const accessToken = await exchangeCodeForToken(code, `${serverEnv.siteUrl}/api/google/callback`);
  if (!accessToken) return failure(origin, state.bookId, "Could not complete sign-in with Google.");

  const from = state.from && isCalendarDate(state.from) ? (state.from as CalendarDate) : undefined;
  const to = state.to && isCalendarDate(state.to) ? (state.to as CalendarDate) : undefined;

  const doc = await compileBookForExport(state.bookId, {
    textVersion: state.textVersion,
    from,
    to,
    includeCover: state.includeCover,
  });

  if (doc.days.length === 0) {
    return failure(origin, state.bookId, "There is nothing to export in that range.");
  }

  try {
    const bytes = await renderBookDocx(doc);
    const created = await uploadDocxAsGoogleDoc(accessToken, doc.title, bytes);
    if (!created) return failure(origin, state.bookId, "Google could not create the document.");

    return NextResponse.redirect(created.url);
  } catch (error) {
    console.error("Google Docs export failed", error);
    return failure(origin, state.bookId, "Could not create the Google Doc.");
  }
}

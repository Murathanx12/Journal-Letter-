import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { getSessionUser } from "@/lib/auth/session";
import { getProofreadProvider } from "@/lib/proofread/anthropic-provider";
import { ProofreadUnavailableError } from "@/lib/proofread/types";
import { createClient } from "@/lib/supabase/server";

/**
 * Proofreading endpoint.
 *
 * Three things are true here and all three matter:
 *
 *   * the caller must be signed in and must be a member of the book, so this
 *     cannot be used as an anonymous proxy to a paid API;
 *   * the API key never leaves the server;
 *   * nothing is sent anywhere until a person presses the button. There is no
 *     background job that reads people's journals.
 */

// Long enough for a properly long letter, short enough to bound cost.
const MAX_PARAGRAPHS = 80;
const MAX_CHARS = 20_000;

const bodySchema = z.object({
  bookId: z.uuid(),
  mode: z.enum(["gentle", "polish"]),
  paragraphs: z.array(z.string()).min(1).max(MAX_PARAGRAPHS),
});

export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const provider = getProofreadProvider();
  if (!provider) {
    return NextResponse.json(
      { error: "Proofreading is not configured on this deployment." },
      { status: 503 },
    );
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Malformed request." }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Malformed request." }, { status: 400 });
  }

  const { bookId, mode, paragraphs } = parsed.data;

  const totalChars = paragraphs.reduce((sum, paragraph) => sum + paragraph.length, 0);
  if (totalChars > MAX_CHARS) {
    return NextResponse.json(
      { error: "That entry is too long to check in one go. Try splitting it up." },
      { status: 413 },
    );
  }

  // Membership check. `is_book_member` is SECURITY DEFINER but only ever reports
  // on the caller's own membership.
  const supabase = await createClient();
  const { data: isMember } = await supabase.rpc("is_book_member", { p_book_id: bookId });
  if (!isMember) return NextResponse.json({ error: "Not found." }, { status: 404 });

  // Blank blocks are sent as-is so indices line up, but there is no point
  // asking a model to correct an empty string.
  const meaningful = paragraphs.map((paragraph) => paragraph.trim());
  if (meaningful.every((paragraph) => paragraph.length === 0)) {
    return NextResponse.json({ mode, corrections: [], unchanged: true });
  }

  try {
    const result = await provider.proofread({ paragraphs, mode });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ProofreadUnavailableError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    // Never surface a provider error verbatim — it can contain request echoes.
    console.error("Proofreading failed", error);
    return NextResponse.json(
      { error: "The proofreader could not be reached. Your writing is untouched." },
      { status: 502 },
    );
  }
}

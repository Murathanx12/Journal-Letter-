import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { getSessionUser } from "@/lib/auth/session";
import { filterCorrections } from "@/lib/proofread/filter";
import { getProofreadProvider } from "@/lib/proofread/dictionary-provider";
import { createClient } from "@/lib/supabase/server";

/**
 * Spell checking endpoint.
 *
 * Runs a Hunspell dictionary in this process. There is no external service, no
 * API key and no cost, and the text does not leave the server that already
 * stores it.
 *
 * The caller must still be signed in and a member of the book: the dictionary
 * is cheap but not free to run, and there is no reason to let a stranger use it.
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
    const result = await getProofreadProvider().proofread({ paragraphs, mode });

    // Belt and braces: every suggestion is re-checked against the
    // spelling-only rules before it is offered to a person.
    return NextResponse.json({
      ...result,
      corrections: filterCorrections(paragraphs, result.corrections, "gentle"),
    });
  } catch (error) {
    console.error("Spell check failed", error);
    return NextResponse.json(
      { error: "The spell checker could not run. Your writing is untouched." },
      { status: 500 },
    );
  }
}

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { getSessionUser } from "@/lib/auth/session";
import { parseLayout } from "@/lib/media/placement";
import { calendarDate, layoutSchema, richTextDoc } from "@/lib/validation/schemas";
import { asRichTextDoc, toPlainText } from "@/lib/text/rich-text";
import { asJson } from "@/lib/supabase/json";
import { createClient } from "@/lib/supabase/server";

/**
 * Autosave.
 *
 * Separate from the `saveEntry` server action on purpose: this fires every
 * couple of seconds while somebody is typing, so it writes *only* the entry row
 * and never appends to `entry_versions`. Recording history on every keystroke
 * would bury the meaningful revisions under thousands of noise rows.
 *
 * A brand-new entry gets created here as a `draft` on the first save, and the
 * id is handed back so subsequent autosaves update rather than duplicate.
 *
 * Authorization is still RLS: the insert carries `author_id = <caller>` and the
 * update is filtered to the caller's own row, so a forged `entryId` belonging to
 * somebody else simply matches nothing.
 */

const bodySchema = z.object({
  bookId: z.uuid(),
  entryId: z.uuid().nullable().optional(),
  entryDate: calendarDate,
  title: z.string().trim().max(160).nullable(),
  content: richTextDoc,
  layout: layoutSchema,
});

export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
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

  const { bookId, entryId, entryDate, title, content } = parsed.data;
  const supabase = await createClient();
  const plainText = toPlainText(asRichTextDoc(content));
  const layout = parseLayout(parsed.data.layout);

  if (entryId) {
    const { data, error } = await supabase
      .from("entries")
      .update({
        entry_date: entryDate,
        title,
        content: asJson(content),
        plain_text: plainText,
        layout: asJson(layout),
      })
      .eq("id", entryId)
      .eq("book_id", bookId)
      .eq("author_id", user.id)
      .select("id, updated_at")
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: "Could not save." }, { status: 500 });
    }
    if (!data) {
      // Either it does not exist or it is not the caller's to edit. Same answer
      // for both, so this cannot be used to probe for entry ids.
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }

    return NextResponse.json({ entryId: data.id, savedAt: data.updated_at });
  }

  // Nothing typed yet — do not litter the book with empty drafts. A page that
  // is only photographs so far still counts as something worth keeping.
  if (plainText.trim().length === 0 && !title && layout.length === 0) {
    return NextResponse.json({ entryId: null, savedAt: null });
  }

  const { data, error } = await supabase
    .from("entries")
    .insert({
      book_id: bookId,
      author_id: user.id,
      entry_date: entryDate,
      title,
      content: asJson(content),
      plain_text: plainText,
      layout: asJson(layout),
      status: "draft",
    })
    .select("id, updated_at")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Could not save." }, { status: 500 });
  }

  return NextResponse.json({ entryId: data.id, savedAt: data.updated_at });
}

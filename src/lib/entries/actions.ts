"use server";

import { revalidatePath } from "next/cache";

import { describeDatabaseError, fail, ok, type ActionResult } from "@/lib/actions/result";
import { requireUser } from "@/lib/auth/session";
import { asJson } from "@/lib/supabase/json";
import { createClient } from "@/lib/supabase/server";
import { asRichTextDoc, fromPlainText, toPlainText, type RichTextDoc } from "@/lib/text/rich-text";
import {
  applyCorrectionSchema,
  bulkImportSchema,
  deleteEntrySchema,
  fieldErrors,
  reorderEntrySchema,
  saveEntrySchema,
} from "@/lib/validation/schemas";

import { reorderWithinDay, type CompiledEntry } from "./compile";

/**
 * Entry mutations.
 *
 * Three rules run through all of this:
 *
 *   1. `plain_text` is always derived here, on the server, from the submitted
 *      document. A client cannot claim an entry says something it does not —
 *      which matters because `plain_text` is what search and export read.
 *
 *   2. The author's original words are captured before any machine correction
 *      touches them, and are never overwritten afterwards.
 *
 *   3. Version history is append-only, and the database has no UPDATE or DELETE
 *      policy on `entry_versions` at all.
 */

async function nextOrderForDay(
  supabase: Awaited<ReturnType<typeof createClient>>,
  bookId: string,
  entryDate: string,
): Promise<number> {
  const { data } = await supabase
    .from("entries")
    .select("within_day_order")
    .eq("book_id", bookId)
    .eq("entry_date", entryDate)
    .order("within_day_order", { ascending: false })
    .limit(1);

  const highest = data?.[0]?.within_day_order;
  return typeof highest === "number" ? highest + 1 : 0;
}

export type SavedEntry = { entryId: string };

/**
 * Create or update an entry, and record a version.
 *
 * Used by the explicit Save/Publish button. Frequent keystroke-level saves go
 * through `/api/entries/autosave` instead, which deliberately does not write
 * history — otherwise a single letter would generate hundreds of versions.
 */
export async function saveEntry(input: unknown): Promise<ActionResult<SavedEntry>> {
  const user = await requireUser();

  const parsed = saveEntrySchema.safeParse(input);
  if (!parsed.success) {
    return fail("Please check the details below.", fieldErrors(parsed.error));
  }
  const values = parsed.data;

  const supabase = await createClient();
  const content = values.content as unknown as RichTextDoc;
  const plainText = toPlainText(asRichTextDoc(content));

  if (values.status === "published" && plainText.trim().length === 0) {
    return fail("There is nothing written yet.");
  }

  if (values.entryId) {
    const { data: updated, error } = await supabase
      .from("entries")
      .update({
        entry_date: values.entryDate,
        title: values.title,
        content: asJson(content),
        plain_text: plainText,
        status: values.status,
        tags: values.tags,
        mood: values.mood,
        location: values.location,
        sealed_until: values.sealedUntil ?? null,
      })
      .eq("id", values.entryId)
      .eq("book_id", values.bookId)
      .select("id")
      .maybeSingle();

    if (error) return fail(describeDatabaseError(error));
    if (!updated) return fail("You do not have permission to edit this entry.");

    await supabase.from("entry_versions").insert({
      entry_id: values.entryId,
      book_id: values.bookId,
      kind: "edit",
      title: values.title,
      content: asJson(content),
      plain_text: plainText,
      created_by: user.id,
    });

    revalidatePath(`/books/${values.bookId}`, "layout");
    return ok({ entryId: values.entryId });
  }

  const withinDayOrder = await nextOrderForDay(supabase, values.bookId, values.entryDate);

  const { data: created, error } = await supabase
    .from("entries")
    .insert({
      book_id: values.bookId,
      author_id: user.id,
      entry_date: values.entryDate,
      within_day_order: withinDayOrder,
      title: values.title,
      content: asJson(content),
      plain_text: plainText,
      status: values.status,
      tags: values.tags,
      mood: values.mood,
      location: values.location,
      sealed_until: values.sealedUntil ?? null,
    })
    .select("id")
    .single();

  if (error || !created) return fail(describeDatabaseError(error));

  // The first thing written is, by definition, the original.
  await supabase.from("entry_versions").insert({
    entry_id: created.id,
    book_id: values.bookId,
    kind: "original",
    title: values.title,
    content: asJson(content),
    plain_text: plainText,
    created_by: user.id,
  });

  revalidatePath(`/books/${values.bookId}`, "layout");
  return ok({ entryId: created.id });
}

export async function deleteEntry(input: unknown): Promise<ActionResult> {
  await requireUser();

  const parsed = deleteEntrySchema.safeParse(input);
  if (!parsed.success) return fail("That entry could not be identified.");

  const supabase = await createClient();
  const { error } = await supabase
    .from("entries")
    .delete()
    .eq("id", parsed.data.entryId)
    .eq("book_id", parsed.data.bookId);

  if (error) return fail(describeDatabaseError(error));

  revalidatePath(`/books/${parsed.data.bookId}`, "layout");
  return ok();
}

/**
 * Move an entry up or down within its day.
 *
 * Mostly useful after importing old letters, where everything arrives with the
 * same timestamp and the real order is only known to the people who wrote them.
 */
export async function reorderEntry(input: unknown): Promise<ActionResult> {
  await requireUser();

  const parsed = reorderEntrySchema.safeParse(input);
  if (!parsed.success) return fail("That entry could not be identified.");
  const { bookId, entryId, direction } = parsed.data;

  const supabase = await createClient();

  const { data: target } = await supabase
    .from("entries")
    .select("entry_date")
    .eq("id", entryId)
    .eq("book_id", bookId)
    .maybeSingle();

  if (!target) return fail("That entry could not be found.");

  const { data: dayRows } = await supabase
    .from("entries")
    .select("id, author_id, entry_date, within_day_order, created_at, title, content, plain_text, correction_state, original_content, tags, mood, location, sealed_until, status")
    .eq("book_id", bookId)
    .eq("entry_date", target.entry_date);

  const dayEntries: CompiledEntry[] = (dayRows ?? []).map((row) => ({
    id: row.id,
    authorId: row.author_id,
    entryDate: row.entry_date,
    withinDayOrder: row.within_day_order,
    createdAt: row.created_at,
    title: row.title,
    content: row.content,
    plainText: row.plain_text,
    correctionState: row.correction_state,
    hasOriginal: row.original_content !== null,
    tags: row.tags,
    mood: row.mood,
    location: row.location,
    sealedUntil: row.sealed_until,
    status: row.status,
  }));

  const updates = reorderWithinDay(dayEntries, entryId, direction);
  if (updates.length === 0) return ok();

  // Only the author of each entry may write to it, so an editor reordering a
  // day containing somebody else's letter will have those rows rejected by RLS.
  // Apply what we can and report honestly if the order could not fully change.
  const results = await Promise.all(
    updates.map((update) =>
      supabase
        .from("entries")
        .update({ within_day_order: update.withinDayOrder })
        .eq("id", update.id)
        .eq("book_id", bookId)
        .select("id")
        .maybeSingle(),
    ),
  );

  const blocked = results.filter((result) => !result.data).length;

  revalidatePath(`/books/${bookId}`, "layout");

  if (blocked > 0) {
    return fail(
      "Only the person who wrote an entry can move it, so part of this day was left as it was.",
    );
  }
  return ok();
}

/**
 * Replace an entry's text with a proofread version.
 *
 * The original is captured on the first correction and never touched again, so
 * "Revert to original" and "Export original writing" always have the author's
 * real words to fall back to.
 */
export async function applyCorrection(input: unknown): Promise<ActionResult> {
  const user = await requireUser();

  const parsed = applyCorrectionSchema.safeParse(input);
  if (!parsed.success) return fail("That correction could not be applied.");
  const { bookId, entryId, content, mode } = parsed.data;

  const supabase = await createClient();

  const { data: entry } = await supabase
    .from("entries")
    .select("content, plain_text, original_content")
    .eq("id", entryId)
    .eq("book_id", bookId)
    .maybeSingle();

  if (!entry) return fail("That entry could not be found.");

  const correctedDoc = content as unknown as RichTextDoc;
  const correctedPlain = toPlainText(asRichTextDoc(correctedDoc));

  const { data: updated, error } = await supabase
    .from("entries")
    .update({
      content: asJson(correctedDoc),
      plain_text: correctedPlain,
      correction_state: mode,
      corrected_at: new Date().toISOString(),
      // Only set on the first correction. Subsequent passes correct the
      // corrected text; the untouched original stays put.
      ...(entry.original_content
        ? {}
        : { original_content: entry.content, original_plain_text: entry.plain_text }),
    })
    .eq("id", entryId)
    .eq("book_id", bookId)
    .select("id")
    .maybeSingle();

  if (error) return fail(describeDatabaseError(error));
  if (!updated) return fail("Only the author can correct this entry.");

  await supabase.from("entry_versions").insert({
    entry_id: entryId,
    book_id: bookId,
    kind: "proofread",
    content: asJson(correctedDoc),
    plain_text: correctedPlain,
    created_by: user.id,
  });

  revalidatePath(`/books/${bookId}`, "layout");
  return ok();
}

export async function revertToOriginal(bookId: string, entryId: string): Promise<ActionResult> {
  await requireUser();

  const supabase = await createClient();

  const { data: entry } = await supabase
    .from("entries")
    .select("original_content, original_plain_text")
    .eq("id", entryId)
    .eq("book_id", bookId)
    .maybeSingle();

  if (!entry) return fail("That entry could not be found.");
  if (!entry.original_content) return fail("This entry has never been corrected.");

  const { data: updated, error } = await supabase
    .from("entries")
    .update({
      content: entry.original_content,
      plain_text: entry.original_plain_text ?? "",
      correction_state: "original",
      corrected_at: null,
    })
    .eq("id", entryId)
    .eq("book_id", bookId)
    .select("id")
    .maybeSingle();

  if (error) return fail(describeDatabaseError(error));
  if (!updated) return fail("Only the author can change this entry.");

  revalidatePath(`/books/${bookId}`, "layout");
  return ok();
}

export async function toggleFavorite(bookId: string, entryId: string): Promise<ActionResult<{ favorited: boolean }>> {
  const user = await requireUser();

  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("favorites")
    .select("entry_id")
    .eq("entry_id", entryId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from("favorites")
      .delete()
      .eq("entry_id", entryId)
      .eq("user_id", user.id);
    if (error) return fail(describeDatabaseError(error));
    revalidatePath(`/books/${bookId}`, "layout");
    return ok({ favorited: false });
  }

  const { error } = await supabase
    .from("favorites")
    .insert({ entry_id: entryId, user_id: user.id, book_id: bookId });

  if (error) return fail(describeDatabaseError(error));

  revalidatePath(`/books/${bookId}`, "layout");
  return ok({ favorited: true });
}

/**
 * Import several dated entries at once.
 *
 * The parsing of a pasted WhatsApp export happens on the client, where the user
 * can see and correct every date before anything is written. This action takes
 * only the reviewed result.
 */
export async function bulkImportEntries(input: unknown): Promise<ActionResult<{ imported: number }>> {
  const user = await requireUser();

  const parsed = bulkImportSchema.safeParse(input);
  if (!parsed.success) {
    return fail("Some of those entries could not be read.", fieldErrors(parsed.error));
  }
  const { bookId, entries } = parsed.data;

  const supabase = await createClient();

  // Continue numbering after whatever is already on each of these days.
  const dates = [...new Set(entries.map((entry) => entry.entryDate))];
  const { data: existingRows } = await supabase
    .from("entries")
    .select("entry_date, within_day_order")
    .eq("book_id", bookId)
    .in("entry_date", dates);

  const nextOrder = new Map<string, number>();
  for (const row of existingRows ?? []) {
    const current = nextOrder.get(row.entry_date) ?? 0;
    nextOrder.set(row.entry_date, Math.max(current, row.within_day_order + 1));
  }

  const rows = entries.map((entry) => {
    const order = nextOrder.get(entry.entryDate) ?? 0;
    nextOrder.set(entry.entryDate, order + 1);
    const content = fromPlainText(entry.body);
    return {
      book_id: bookId,
      author_id: user.id,
      entry_date: entry.entryDate,
      within_day_order: order,
      title: entry.title,
      content: asJson(content),
      plain_text: toPlainText(content),
      status: "published" as const,
    };
  });

  const { data: inserted, error } = await supabase.from("entries").insert(rows).select("id");

  if (error) return fail(describeDatabaseError(error));

  revalidatePath(`/books/${bookId}`, "layout");
  return ok({ imported: inserted?.length ?? 0 });
}

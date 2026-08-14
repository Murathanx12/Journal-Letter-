import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/supabase/database.types";
import { asRichTextDoc } from "@/lib/text/rich-text";
import type { CalendarDate } from "@/lib/date/calendar-date";
import { parseLayout, pathsInLayout, type PlacedMedia } from "@/lib/media/placement";
import { signMediaPaths } from "@/lib/media/storage";

import { groupEntriesByDay, type BookDay, type CompiledEntry } from "./compile";

/**
 * Every query here runs through the caller's own Supabase session, so RLS does
 * the authorization. There is intentionally no service-role client anywhere in
 * this application — nothing can accidentally read past a book's membership.
 */

const ENTRY_COLUMNS =
  "id, book_id, author_id, entry_date, within_day_order, created_at, updated_at, title, content, plain_text, original_content, original_plain_text, correction_state, mood, tags, location, sealed_until, status, layout";

type EntryRow = Pick<
  Tables<"entries">,
  | "id"
  | "book_id"
  | "author_id"
  | "entry_date"
  | "within_day_order"
  | "created_at"
  | "updated_at"
  | "title"
  | "content"
  | "plain_text"
  | "original_content"
  | "original_plain_text"
  | "correction_state"
  | "mood"
  | "tags"
  | "location"
  | "sealed_until"
  | "status"
  | "layout"
>;

function toCompiled(row: EntryRow): CompiledEntry {
  return {
    id: row.id,
    authorId: row.author_id,
    entryDate: row.entry_date,
    withinDayOrder: row.within_day_order,
    createdAt: row.created_at,
    title: row.title,
    content: row.content,
    plainText: row.plain_text,
    layout: parseLayout(row.layout),
    correctionState: row.correction_state,
    hasOriginal: row.original_content !== null,
    tags: row.tags,
    mood: row.mood,
    location: row.location,
    sealedUntil: row.sealed_until,
    status: row.status,
  };
}

export type FullEntry = CompiledEntry & {
  bookId: string;
  updatedAt: string;
  originalContent: unknown | null;
  originalPlainText: string | null;
};

export async function getEntry(bookId: string, entryId: string): Promise<FullEntry | null> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("entries")
    .select(ENTRY_COLUMNS)
    .eq("book_id", bookId)
    .eq("id", entryId)
    .maybeSingle();

  if (!data) return null;

  return {
    ...toCompiled(data),
    bookId: data.book_id,
    updatedAt: data.updated_at,
    originalContent: data.original_content,
    originalPlainText: data.original_plain_text,
  };
}

export type ReadPage = {
  days: BookDay[];
  /** Pass back as `before` to fetch the previous page. Null when at the start. */
  nextCursor: CalendarDate | null;
};

/**
 * A page of the book, newest day first.
 *
 * Pagination is by *day*, not by row: a page boundary must never fall in the
 * middle of 14 August, or the reading view would show half a day and then
 * repeat it. We over-fetch by one day's worth and trim back to a whole day.
 */
export async function getBookDays(
  bookId: string,
  options: { before?: CalendarDate; dayLimit?: number; from?: CalendarDate; to?: CalendarDate } = {},
): Promise<ReadPage> {
  const supabase = await createClient();
  const dayLimit = options.dayLimit ?? 20;

  let query = supabase
    .from("entries")
    .select(ENTRY_COLUMNS)
    .eq("book_id", bookId)
    .eq("status", "published")
    .order("entry_date", { ascending: false })
    .order("within_day_order", { ascending: true })
    .order("created_at", { ascending: true })
    // Generous row cap: enough to cover `dayLimit` days even when a day holds
    // many letters, without ever streaming a whole multi-year book.
    .limit(dayLimit * 12);

  if (options.before) query = query.lt("entry_date", options.before);
  if (options.from) query = query.gte("entry_date", options.from);
  if (options.to) query = query.lte("entry_date", options.to);

  const { data } = await query;
  const rows = (data ?? []).map(toCompiled);

  const allDays = groupEntriesByDay(rows, "desc");
  const days = allDays.slice(0, dayLimit);

  // Only claim there is more when we actually filled the page.
  const nextCursor = allDays.length > dayLimit ? (days.at(-1)?.date ?? null) : null;

  return { days, nextCursor };
}

/** The whole book in reading order. Used by export, which must not paginate. */
export async function getAllEntriesForExport(
  bookId: string,
  range: { from?: CalendarDate; to?: CalendarDate } = {},
): Promise<{ days: BookDay[]; originals: Map<string, { content: unknown; plainText: string }> }> {
  const supabase = await createClient();

  const rows: EntryRow[] = [];
  const pageSize = 500;

  // Page through explicitly rather than trusting a single unbounded select —
  // a ten-year book is a lot of rows and PostgREST caps responses anyway.
  for (let offset = 0; ; offset += pageSize) {
    let query = supabase
      .from("entries")
      .select(ENTRY_COLUMNS)
      .eq("book_id", bookId)
      .eq("status", "published")
      .order("entry_date", { ascending: true })
      .order("within_day_order", { ascending: true })
      .order("created_at", { ascending: true })
      .range(offset, offset + pageSize - 1);

    if (range.from) query = query.gte("entry_date", range.from);
    if (range.to) query = query.lte("entry_date", range.to);

    const { data } = await query;
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < pageSize) break;
  }

  const originals = new Map<string, { content: unknown; plainText: string }>();
  for (const row of rows) {
    if (row.original_content) {
      originals.set(row.id, {
        content: row.original_content,
        plainText: row.original_plain_text ?? "",
      });
    }
  }

  return { days: groupEntriesByDay(rows.map(toCompiled), "asc"), originals };
}

export async function getRecentEntries(bookId: string, limit = 5): Promise<CompiledEntry[]> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("entries")
    .select(ENTRY_COLUMNS)
    .eq("book_id", bookId)
    .eq("status", "published")
    .order("entry_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);

  return (data ?? []).map(toCompiled);
}

/** The viewer's own unfinished drafts. RLS keeps other people's drafts hidden. */
export async function getMyDrafts(bookId: string): Promise<CompiledEntry[]> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("entries")
    .select(ENTRY_COLUMNS)
    .eq("book_id", bookId)
    .eq("status", "draft")
    .order("updated_at", { ascending: false })
    .limit(10);

  return (data ?? []).map(toCompiled);
}

export async function getEntriesForDate(bookId: string, date: CalendarDate): Promise<CompiledEntry[]> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("entries")
    .select(ENTRY_COLUMNS)
    .eq("book_id", bookId)
    .eq("entry_date", date)
    .eq("status", "published")
    .order("within_day_order", { ascending: true })
    .order("created_at", { ascending: true });

  return (data ?? []).map(toCompiled);
}

/**
 * Signed URLs for every photograph across a set of entries, in one round trip.
 *
 * Signing per image would be a request per picture on a page that might have
 * dozens.
 */
export async function signEntryMedia(
  entries: readonly { layout: readonly PlacedMedia[] }[],
): Promise<Map<string, string>> {
  const paths = entries.flatMap((entry) => pathsInLayout(entry.layout));
  if (paths.length === 0) return new Map();
  return signMediaPaths(paths);
}

/** Same, for entries already grouped into days. */
export async function signDayMedia(
  days: readonly { entries: readonly { layout: readonly PlacedMedia[] }[] }[],
): Promise<Map<string, string>> {
  return signEntryMedia(days.flatMap((day) => day.entries));
}

/** Photographs uploaded against an entry, for the editor's picker. */
export async function getEntryAttachments(bookId: string, entryId: string) {
  const supabase = await createClient();

  const { data } = await supabase
    .from("attachments")
    .select("id, storage_path, width, height, caption")
    .eq("book_id", bookId)
    .eq("entry_id", entryId)
    .order("created_at", { ascending: true })
    .limit(60);

  const rows = data ?? [];
  const urls = await signMediaPaths(rows.map((row) => row.storage_path));

  return rows.map((row) => ({
    id: row.id,
    path: row.storage_path,
    url: urls.get(row.storage_path) ?? null,
    width: row.width,
    height: row.height,
    caption: row.caption,
  }));
}

export type CalendarDay = {
  date: CalendarDate;
  entryCount: number;
  authorIds: string[];
};

export async function getCalendar(
  bookId: string,
  from: CalendarDate,
  to: CalendarDate,
): Promise<CalendarDay[]> {
  const supabase = await createClient();

  const { data } = await supabase.rpc("book_calendar", {
    p_book_id: bookId,
    p_from: from,
    p_to: to,
  });

  return (data ?? []).map((row) => ({
    date: row.entry_date,
    entryCount: Number(row.entry_count),
    authorIds: row.author_ids ?? [],
  }));
}

/** Metadata about letters that are sealed until a future date. Never content. */
export async function getSealedPreviews(bookId: string) {
  const supabase = await createClient();
  const { data } = await supabase.rpc("sealed_entry_previews", { p_book_id: bookId });
  return (data ?? []).map((row) => ({
    id: row.id,
    authorId: row.author_id,
    entryDate: row.entry_date,
    sealedUntil: row.sealed_until,
  }));
}

export type SearchHit = {
  id: string;
  bookId: string;
  authorId: string;
  entryDate: CalendarDate;
  title: string | null;
  snippet: string;
};

export type SearchFilters = {
  bookId?: string;
  authorId?: string;
  from?: CalendarDate;
  to?: CalendarDate;
  tag?: string;
};

/**
 * Search across every book the viewer can read.
 *
 * Uses the generated `search_vector` (a `simple` dictionary, so mixed-language
 * and affectionate invented words survive) with a plain `ilike` fallback for
 * short or partial words, which `to_tsquery` handles poorly.
 */
export async function searchEntries(
  term: string,
  filters: SearchFilters = {},
  limit = 50,
): Promise<SearchHit[]> {
  const supabase = await createClient();
  const trimmed = term.trim();

  let query = supabase
    .from("entries")
    .select("id, book_id, author_id, entry_date, title, plain_text")
    .eq("status", "published")
    .order("entry_date", { ascending: false })
    .limit(limit);

  if (filters.bookId) query = query.eq("book_id", filters.bookId);
  if (filters.authorId) query = query.eq("author_id", filters.authorId);
  if (filters.from) query = query.gte("entry_date", filters.from);
  if (filters.to) query = query.lte("entry_date", filters.to);
  if (filters.tag) query = query.contains("tags", [filters.tag]);

  if (trimmed.length > 0) {
    query =
      trimmed.length >= 3
        ? query.textSearch("search_vector", trimmed, { type: "websearch", config: "simple" })
        : query.ilike("plain_text", `%${trimmed}%`);
  }

  const { data } = await query;

  return (data ?? []).map((row) => ({
    id: row.id,
    bookId: row.book_id,
    authorId: row.author_id,
    entryDate: row.entry_date,
    title: row.title,
    snippet: buildSnippet(row.plain_text, trimmed),
  }));
}

export type WordCount = { occurrences: number; entries: number };

/**
 * How often a term appears across a whole book, not just in the results shown.
 *
 * Search answers "which letters mention the ferry"; this answers "how often does
 * the ferry come up", which is a different question and the more interesting one
 * once a book covers years. Counted in Postgres over every matching entry rather
 * than over the capped result list, so the number does not quietly stop at 100.
 *
 * Whole words only, so "ferry" is not also counted inside "ferryman".
 */
export async function countWordOccurrences(
  term: string,
  filters: SearchFilters = {},
): Promise<WordCount | null> {
  const trimmed = term.trim();
  if (!trimmed || !filters.bookId) return null;

  const supabase = await createClient();

  const { data } = await supabase.rpc("search_word_count", {
    p_book_id: filters.bookId,
    p_term: trimmed,
    p_author: filters.authorId ?? undefined,
    p_from: filters.from ?? undefined,
    p_to: filters.to ?? undefined,
    p_tag: filters.tag ?? undefined,
  });

  const row = data?.[0];
  if (!row) return null;

  return { occurrences: Number(row.occurrences), entries: Number(row.entries) };
}

/** A short excerpt centred on the first match, so results show *why* they matched. */
export function buildSnippet(text: string, term: string, radius = 90): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!term) return clean.slice(0, radius * 2);

  const index = clean.toLowerCase().indexOf(term.toLowerCase());
  if (index === -1) return clean.slice(0, radius * 2);

  const start = Math.max(0, index - radius);
  const end = Math.min(clean.length, index + term.length + radius);
  return `${start > 0 ? "…" : ""}${clean.slice(start, end)}${end < clean.length ? "…" : ""}`;
}

export type OnThisDayHit = {
  id: string;
  bookId: string;
  authorId: string;
  entryDate: CalendarDate;
  title: string | null;
  excerpt: string;
};

export async function getOnThisDay(today: CalendarDate): Promise<OnThisDayHit[]> {
  const supabase = await createClient();
  const month = Number(today.slice(5, 7));
  const day = Number(today.slice(8, 10));

  const { data } = await supabase.rpc("on_this_day", { p_month: month, p_day: day });

  return (data ?? [])
    // Only look backwards — an entry dated today is not a memory yet.
    .filter((row) => row.entry_date < today)
    .map((row) => ({
      id: row.id,
      bookId: row.book_id,
      authorId: row.author_id,
      entryDate: row.entry_date,
      title: row.title,
      excerpt: row.plain_text.replace(/\s+/g, " ").trim().slice(0, 240),
    }));
}

export async function getFavorites(bookId: string): Promise<Set<string>> {
  const supabase = await createClient();
  const { data } = await supabase.from("favorites").select("entry_id").eq("book_id", bookId);
  return new Set((data ?? []).map((row) => row.entry_id));
}

export async function getEntryVersions(bookId: string, entryId: string) {
  const supabase = await createClient();

  const { data } = await supabase
    .from("entry_versions")
    .select("id, kind, title, plain_text, created_by, created_at, content")
    .eq("book_id", bookId)
    .eq("entry_id", entryId)
    .order("created_at", { ascending: false })
    .limit(50);

  return (data ?? []).map((row) => ({
    id: row.id,
    kind: row.kind,
    title: row.title,
    plainText: row.plain_text,
    createdBy: row.created_by,
    createdAt: row.created_at,
    content: asRichTextDoc(row.content),
  }));
}

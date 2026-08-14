import "server-only";

import { notFound } from "next/navigation";
import { cache } from "react";

import { getSessionUser } from "@/lib/auth/session";
import { parseCover, parseDesign, resolveDesign, type BookCover, type BookDesign, type ResolvedDesign } from "@/lib/design/theme";
import { createClient } from "@/lib/supabase/server";
import type { Enums, Tables } from "@/lib/supabase/database.types";
import { todayIn, type CalendarDate } from "@/lib/date/calendar-date";

export type MemberRole = Enums<"member_role">;
export type BookType = Enums<"book_type">;

export type BookMember = {
  userId: string;
  role: MemberRole;
  joinedAt: string;
  displayName: string;
  avatarUrl: string | null;
  preferredFont: string;
  signature: string | null;
  accent: string;
};

export type Book = {
  id: string;
  ownerId: string;
  type: BookType;
  title: string;
  subtitle: string | null;
  description: string | null;
  timezone: string;
  cover: BookCover;
  design: BookDesign;
  resolvedDesign: ResolvedDesign;
  createdAt: string;
  archivedAt: string | null;
  /** The viewer's role in this book. */
  role: MemberRole;
  canWrite: boolean;
  isOwner: boolean;
  /** Today, in the book's timezone — not the reader's. */
  today: CalendarDate;
};

function toBook(row: Tables<"books">, role: MemberRole): Book {
  const design = parseDesign(row.design);
  return {
    id: row.id,
    ownerId: row.owner_id,
    type: row.type,
    title: row.title,
    subtitle: row.subtitle,
    description: row.description,
    timezone: row.timezone,
    cover: parseCover(row.cover),
    design,
    resolvedDesign: resolveDesign(design),
    createdAt: row.created_at,
    archivedAt: row.archived_at,
    role,
    canWrite: role === "owner" || role === "editor",
    isOwner: role === "owner",
    today: todayIn(row.timezone),
  };
}

/**
 * Load a book the viewer is allowed to see, or 404.
 *
 * Returning `notFound()` rather than a 403 is deliberate: a stranger poking at
 * `/books/<uuid>` learns nothing about whether that book exists. RLS is what
 * actually withholds the data — this just turns "no rows" into a clean page.
 */
export const getBook = cache(async (bookId: string): Promise<Book> => {
  const supabase = await createClient();
  const user = await getSessionUser();
  if (!user) notFound();

  const [{ data: book }, { data: membership }] = await Promise.all([
    supabase.from("books").select("*").eq("id", bookId).maybeSingle(),
    // Scoped to *this* reader. A member can see everyone in the book, so
    // without `user_id` this asks for "the memberships of this book" — which is
    // more than one row the moment a second person joins, and `maybeSingle()`
    // answers a multi-row result with null. That turned a shared book into a
    // 404 for everybody in it, the instant it stopped being solo.
    supabase
      .from("book_members")
      .select("role")
      .eq("book_id", bookId)
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  if (!book || !membership) notFound();

  return toBook(book, membership.role);
});

/** Same as `getBook` but also insists the viewer may write. */
export async function getWritableBook(bookId: string): Promise<Book> {
  const book = await getBook(bookId);
  if (!book.canWrite) notFound();
  return book;
}

export const getBookMembers = cache(async (bookId: string): Promise<BookMember[]> => {
  const supabase = await createClient();

  const { data: members } = await supabase
    .from("book_members")
    .select("user_id, role, joined_at")
    .eq("book_id", bookId)
    .order("joined_at", { ascending: true });

  if (!members || members.length === 0) return [];

  const { data: profiles } = await supabase
    .from("profiles")
    .select("*")
    .in(
      "id",
      members.map((m) => m.user_id),
    );

  const byId = new Map((profiles ?? []).map((p) => [p.id, p]));

  return members.map((member) => {
    const profile = byId.get(member.user_id);
    return {
      userId: member.user_id,
      role: member.role,
      joinedAt: member.joined_at,
      displayName: profile?.display_name ?? "A writer",
      avatarUrl: profile?.avatar_url ?? null,
      preferredFont: profile?.preferred_font ?? "literata",
      signature: profile?.signature ?? null,
      accent: profile?.accent ?? "ink",
    };
  });
});

/** Members keyed by id — what the reading view needs to label each entry. */
export async function getMemberMap(bookId: string): Promise<Map<string, BookMember>> {
  const members = await getBookMembers(bookId);
  return new Map(members.map((member) => [member.userId, member]));
}

export type LibraryBook = Book & {
  memberCount: number;
  entryCount: number;
  wordCount: number;
  lastEntryDate: CalendarDate | null;
};

/**
 * The whole Library in three queries, regardless of how many books there are.
 */
export async function getLibrary(): Promise<LibraryBook[]> {
  const supabase = await createClient();
  const user = await getSessionUser();
  if (!user) return [];

  // `user_id` matters as much here as in `getBook`: a member can see everyone in
  // their books, so an unscoped select returns other people's rows too, and the
  // map below would end up holding somebody else's role — which decides whether
  // this reader is shown as the owner and whether they may write.
  const { data: memberships } = await supabase
    .from("book_members")
    .select("book_id, role")
    .eq("user_id", user.id);

  if (!memberships || memberships.length === 0) return [];

  const roleByBook = new Map(memberships.map((m) => [m.book_id, m.role]));

  const [{ data: books }, { data: overview }, { data: allMembers }] = await Promise.all([
    supabase.from("books").select("*").order("updated_at", { ascending: false }),
    supabase.rpc("library_overview"),
    supabase.from("book_members").select("book_id, user_id"),
  ]);

  const stats = new Map((overview ?? []).map((row) => [row.book_id, row]));

  const memberCounts = new Map<string, number>();
  for (const row of allMembers ?? []) {
    memberCounts.set(row.book_id, (memberCounts.get(row.book_id) ?? 0) + 1);
  }

  return (books ?? [])
    .filter((row) => roleByBook.has(row.id))
    .map((row) => {
      const stat = stats.get(row.id);
      return {
        ...toBook(row, roleByBook.get(row.id)!),
        memberCount: memberCounts.get(row.id) ?? 1,
        entryCount: Number(stat?.entry_count ?? 0),
        wordCount: Number(stat?.word_count ?? 0),
        lastEntryDate: stat?.last_entry_date ?? null,
      };
    });
}

export type BookStats = {
  entryCount: number;
  wordCount: number;
  daysWritten: number;
  firstEntryDate: CalendarDate | null;
  lastEntryDate: CalendarDate | null;
  contributors: { authorId: string; entryCount: number; wordCount: number }[];
};

export async function getBookStats(bookId: string): Promise<BookStats> {
  const supabase = await createClient();

  const [{ data: totals }, { data: byAuthor }] = await Promise.all([
    supabase.rpc("book_stats", { p_book_id: bookId }),
    supabase.rpc("book_contributor_stats", { p_book_id: bookId }),
  ]);

  const row = totals?.[0];

  return {
    entryCount: Number(row?.entry_count ?? 0),
    wordCount: Number(row?.word_count ?? 0),
    daysWritten: Number(row?.days_written ?? 0),
    firstEntryDate: row?.first_entry_date ?? null,
    lastEntryDate: row?.last_entry_date ?? null,
    contributors: (byAuthor ?? []).map((c) => ({
      authorId: c.author_id,
      entryCount: Number(c.entry_count),
      wordCount: Number(c.word_count),
    })),
  };
}

export type PendingInvitation = {
  id: string;
  email: string | null;
  role: MemberRole;
  createdAt: string;
  expiresAt: string;
  isExpired: boolean;
};

export async function getPendingInvitations(bookId: string): Promise<PendingInvitation[]> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("book_invitations")
    .select("id, invited_email, role, created_at, expires_at, accepted_at, revoked_at")
    .eq("book_id", bookId)
    .is("accepted_at", null)
    .is("revoked_at", null)
    .order("created_at", { ascending: false });

  const now = Date.now();

  return (data ?? []).map((row) => ({
    id: row.id,
    email: row.invited_email,
    role: row.role,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    isExpired: new Date(row.expires_at).getTime() <= now,
  }));
}

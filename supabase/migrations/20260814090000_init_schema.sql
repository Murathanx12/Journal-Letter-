-- =============================================================================
-- Journal & Letter — initial schema
--
-- Design notes that matter for the rest of the system:
--
--  * `entries.entry_date` is a plain calendar DATE, deliberately not a
--    timestamp. "August 14" must mean August 14 in the book's timezone and must
--    never drift because of UTC conversion. `created_at` is a real timestamptz
--    and answers a different question ("when was this typed?"). Backdated
--    imports set entry_date freely while created_at stays honest.
--
--  * A book's membership is the single source of truth for authorization.
--    Every private table carries `book_id` (denormalised where needed) so an
--    RLS policy can be answered without a join.
--
--  * Invitation tokens are stored only as SHA-256 hashes. A database dump
--    therefore does not hand out working invitations.
-- =============================================================================

create extension if not exists pgcrypto with schema extensions;

-- -----------------------------------------------------------------------------
-- Enumerations
-- -----------------------------------------------------------------------------

create type public.book_type as enum ('personal_journal', 'shared_letter_book');

-- Roles are deliberately broader than V1's UI needs so permissions can grow
-- without a destructive migration.
create type public.member_role as enum ('owner', 'editor', 'viewer');

create type public.entry_status as enum ('draft', 'published');

-- Which text the reader is currently being shown. 'original' means the author's
-- words have never been touched by machine assistance.
create type public.correction_state as enum ('original', 'gentle', 'polish');

create type public.entry_version_kind as enum (
  'original',        -- the untouched first draft, written by a human
  'edit',            -- a later human revision
  'proofread'        -- the accepted result of an AI proofreading pass
);

-- -----------------------------------------------------------------------------
-- profiles
-- -----------------------------------------------------------------------------

create table public.profiles (
  id             uuid primary key references auth.users (id) on delete cascade,
  display_name   text not null default 'Writer',
  avatar_url     text,
  -- Identity in the compiled book: each writer gets a font, a signature and a
  -- restrained accent so their pages are recognisable without being garish.
  preferred_font text not null default 'literata',
  signature      text,
  accent         text not null default 'ink',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint profiles_display_name_length check (char_length(display_name) between 1 and 80),
  constraint profiles_signature_length check (signature is null or char_length(signature) <= 80)
);

comment on table public.profiles is
  'Public-facing identity of a writer, readable only by people who share a book.';

-- -----------------------------------------------------------------------------
-- books
-- -----------------------------------------------------------------------------

create table public.books (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users (id) on delete cascade,
  type        public.book_type not null,
  title       text not null,
  subtitle    text,
  description text,
  -- Every book pins its own timezone; contributors may live in different
  -- countries and the book's calendar must not depend on who is reading.
  timezone    text not null default 'UTC',
  cover       jsonb not null default '{"preset":"linen","imagePath":null}'::jsonb,
  design      jsonb not null default '{"preset":"classic-novel"}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  archived_at timestamptz,
  constraint books_title_length check (char_length(title) between 1 and 120),
  constraint books_subtitle_length check (subtitle is null or char_length(subtitle) <= 160)
);

create index books_owner_id_idx on public.books (owner_id);

-- -----------------------------------------------------------------------------
-- book_members
-- -----------------------------------------------------------------------------

create table public.book_members (
  book_id   uuid not null references public.books (id) on delete cascade,
  user_id   uuid not null references auth.users (id) on delete cascade,
  role      public.member_role not null default 'editor',
  joined_at timestamptz not null default now(),
  primary key (book_id, user_id)
);

create index book_members_user_id_idx on public.book_members (user_id);

-- -----------------------------------------------------------------------------
-- book_invitations
-- -----------------------------------------------------------------------------

create table public.book_invitations (
  id            uuid primary key default gen_random_uuid(),
  book_id       uuid not null references public.books (id) on delete cascade,
  -- Optional. When present, only an account with this email may accept.
  invited_email text,
  role          public.member_role not null default 'editor',
  -- SHA-256 of the raw token. The raw token exists only in the invite URL.
  token_hash    text not null unique,
  created_by    uuid not null references auth.users (id) on delete cascade,
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null default (now() + interval '14 days'),
  accepted_at   timestamptz,
  accepted_by   uuid references auth.users (id) on delete set null,
  revoked_at    timestamptz,
  constraint book_invitations_email_is_lowercase
    check (invited_email is null or invited_email = lower(invited_email)),
  constraint book_invitations_role_not_owner check (role <> 'owner')
);

create index book_invitations_book_id_idx on public.book_invitations (book_id);

-- -----------------------------------------------------------------------------
-- entries
-- -----------------------------------------------------------------------------

create table public.entries (
  id                  uuid primary key default gen_random_uuid(),
  book_id             uuid not null references public.books (id) on delete cascade,
  author_id           uuid not null references auth.users (id) on delete cascade,

  -- The date the writing belongs to. Set freely when importing old letters.
  entry_date          date not null,
  -- Ties are broken by submission order within a day; editable for imports.
  within_day_order    integer not null default 0,

  title               text,
  status              public.entry_status not null default 'published',

  -- What the reader currently sees (TipTap JSON) plus a flattened copy used for
  -- search, exports and word counts.
  content             jsonb not null,
  plain_text          text not null default '',

  -- The author's untouched words. Populated the first time a correction is
  -- accepted and never overwritten afterwards, so "Revert to original" and
  -- "Export original writing" always have something true to return to.
  original_content    jsonb,
  original_plain_text text,
  correction_state    public.correction_state not null default 'original',
  corrected_at        timestamptz,

  mood                text,
  tags                text[] not null default '{}'::text[],
  location            text,

  -- A letter that must stay unreadable until a future date. Enforced in RLS,
  -- not in the UI.
  sealed_until        date,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  -- 'simple' rather than 'english': these letters mix languages and affectionate
  -- invented words, and stemming them would do more harm than good.
  search_vector tsvector generated always as (
    to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(plain_text, ''))
  ) stored,

  constraint entries_title_length check (title is null or char_length(title) <= 160),
  constraint entries_tags_count check (array_length(tags, 1) is null or array_length(tags, 1) <= 20)
);

-- The primary read pattern: one book, in book order.
create index entries_book_date_order_idx
  on public.entries (book_id, entry_date desc, within_day_order asc, created_at asc);
create index entries_author_idx on public.entries (book_id, author_id);
create index entries_search_idx on public.entries using gin (search_vector);
create index entries_tags_idx on public.entries using gin (tags);
-- Supports "On this day" lookups across a user's books.
create index entries_month_day_idx
  on public.entries (book_id, (extract(month from entry_date)), (extract(day from entry_date)));

-- -----------------------------------------------------------------------------
-- entry_versions
-- -----------------------------------------------------------------------------

create table public.entry_versions (
  id         uuid primary key default gen_random_uuid(),
  entry_id   uuid not null references public.entries (id) on delete cascade,
  -- Denormalised so authorization never needs to join back to entries.
  book_id    uuid not null references public.books (id) on delete cascade,
  kind       public.entry_version_kind not null default 'edit',
  title      text,
  content    jsonb not null,
  plain_text text not null default '',
  created_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index entry_versions_entry_idx on public.entry_versions (entry_id, created_at desc);

-- -----------------------------------------------------------------------------
-- attachments
-- -----------------------------------------------------------------------------

create table public.attachments (
  id           uuid primary key default gen_random_uuid(),
  book_id      uuid not null references public.books (id) on delete cascade,
  entry_id     uuid references public.entries (id) on delete cascade,
  uploader_id  uuid not null references auth.users (id) on delete cascade,
  -- Path inside the private `book-media` bucket. Always `<book_id>/<...>` so the
  -- storage policies can authorize from the first path segment alone.
  storage_path text not null unique,
  mime_type    text not null,
  byte_size    bigint not null,
  width        integer,
  height       integer,
  caption      text,
  created_at   timestamptz not null default now(),
  constraint attachments_path_starts_with_book
    check (storage_path like (book_id::text || '/%'))
);

create index attachments_entry_idx on public.attachments (entry_id);
create index attachments_book_idx on public.attachments (book_id);

-- -----------------------------------------------------------------------------
-- favorites
-- -----------------------------------------------------------------------------

create table public.favorites (
  entry_id   uuid not null references public.entries (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  book_id    uuid not null references public.books (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (entry_id, user_id)
);

create index favorites_book_user_idx on public.favorites (book_id, user_id);

-- -----------------------------------------------------------------------------
-- entry_reactions — deliberately one small reaction per person, per entry.
-- This is not a comment system and must not grow into one.
-- -----------------------------------------------------------------------------

create table public.entry_reactions (
  entry_id   uuid not null references public.entries (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  book_id    uuid not null references public.books (id) on delete cascade,
  emoji      text not null,
  note       text,
  created_at timestamptz not null default now(),
  primary key (entry_id, user_id),
  constraint entry_reactions_note_length check (note is null or char_length(note) <= 140),
  constraint entry_reactions_emoji_length check (char_length(emoji) <= 8)
);

-- -----------------------------------------------------------------------------
-- milestones
-- -----------------------------------------------------------------------------

create table public.milestones (
  id         uuid primary key default gen_random_uuid(),
  book_id    uuid not null references public.books (id) on delete cascade,
  created_by uuid not null references auth.users (id) on delete cascade,
  event_date date not null,
  title      text not null,
  kind       text not null default 'custom',
  created_at timestamptz not null default now(),
  constraint milestones_title_length check (char_length(title) between 1 and 120)
);

create index milestones_book_date_idx on public.milestones (book_id, event_date);

-- -----------------------------------------------------------------------------
-- updated_at maintenance
-- -----------------------------------------------------------------------------

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_touch_updated_at before update on public.profiles
  for each row execute function public.touch_updated_at();
create trigger books_touch_updated_at before update on public.books
  for each row execute function public.touch_updated_at();
create trigger entries_touch_updated_at before update on public.entries
  for each row execute function public.touch_updated_at();

-- -----------------------------------------------------------------------------
-- New auth users get a profile automatically.
-- -----------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
      nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
      nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
      split_part(coalesce(new.email, 'writer@local'), '@', 1)
    ),
    nullif(trim(new.raw_user_meta_data ->> 'avatar_url'), '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- -----------------------------------------------------------------------------
-- The creator of a book is always its first member.
-- -----------------------------------------------------------------------------

create or replace function public.handle_new_book()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.book_members (book_id, user_id, role)
  values (new.id, new.owner_id, 'owner')
  on conflict (book_id, user_id) do update set role = 'owner';
  return new;
end;
$$;

create trigger on_book_created
  after insert on public.books
  for each row execute function public.handle_new_book();

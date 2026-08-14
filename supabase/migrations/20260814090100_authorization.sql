-- =============================================================================
-- Journal & Letter — authorization helpers and Row Level Security
--
-- The rule this file exists to enforce:
--
--     Nothing in a book is readable unless you are an accepted member of that
--     book. Guessing an id or a URL gets you an empty result set, not content.
--
-- Every helper below is SECURITY DEFINER on purpose. `book_members` is
-- consulted by the policies of almost every table *including its own*, and a
-- plain subquery would recurse. A definer function reads the membership table
-- once, outside RLS, and returns a boolean — which is also far cheaper.
--
-- Each helper pins `search_path` to the empty string and fully qualifies every
-- name, so a caller cannot shadow `public` and trick the definer into running
-- something else.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Helpers
-- -----------------------------------------------------------------------------

create or replace function public.is_book_member(p_book_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.book_members m
    where m.book_id = p_book_id
      and m.user_id = (select auth.uid())
  );
$$;

create or replace function public.book_role(p_book_id uuid)
returns public.member_role
language sql
security definer
stable
set search_path = ''
as $$
  select m.role
  from public.book_members m
  where m.book_id = p_book_id
    and m.user_id = (select auth.uid());
$$;

-- Owners and editors may write; viewers may only read.
create or replace function public.can_write_book(p_book_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.book_members m
    where m.book_id = p_book_id
      and m.user_id = (select auth.uid())
      and m.role in ('owner', 'editor')
  );
$$;

-- Used by the profiles policy: you may see someone's name and signature only
-- because you share a book with them, never merely because you are logged in.
create or replace function public.shares_book_with(p_user_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.book_members mine
    join public.book_members theirs on theirs.book_id = mine.book_id
    where mine.user_id = (select auth.uid())
      and theirs.user_id = p_user_id
  );
$$;

-- "Today" always means today in the book's own timezone.
create or replace function public.book_today(p_book_id uuid)
returns date
language sql
security definer
stable
set search_path = ''
as $$
  select (
    now() at time zone coalesce(
      (select b.timezone from public.books b where b.id = p_book_id),
      'UTC'
    )
  )::date;
$$;

-- -----------------------------------------------------------------------------
-- Enable RLS everywhere. No table in `public` is left open.
-- -----------------------------------------------------------------------------

alter table public.profiles          enable row level security;
alter table public.books             enable row level security;
alter table public.book_members      enable row level security;
alter table public.book_invitations  enable row level security;
alter table public.entries           enable row level security;
alter table public.entry_versions    enable row level security;
alter table public.attachments       enable row level security;
alter table public.favorites         enable row level security;
alter table public.entry_reactions   enable row level security;
alter table public.milestones        enable row level security;

-- Belt and braces: the anon role should never touch private content directly.
-- Policies below are all scoped `to authenticated`, so anon has no policy at
-- all and therefore no rows.
revoke all on public.profiles, public.books, public.book_members,
              public.book_invitations, public.entries, public.entry_versions,
              public.attachments, public.favorites, public.entry_reactions,
              public.milestones
  from anon;

-- -----------------------------------------------------------------------------
-- profiles
-- -----------------------------------------------------------------------------

create policy "profiles are visible to yourself and your co-writers"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()) or public.shares_book_with(id));

create policy "you may create your own profile"
  on public.profiles for insert to authenticated
  with check (id = (select auth.uid()));

create policy "you may edit only your own profile"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- -----------------------------------------------------------------------------
-- books
-- -----------------------------------------------------------------------------

create policy "books are visible to their members"
  on public.books for select to authenticated
  using (public.is_book_member(id));

create policy "you may create books you own"
  on public.books for insert to authenticated
  with check (owner_id = (select auth.uid()));

create policy "only the owner may change a book"
  on public.books for update to authenticated
  using (public.book_role(id) = 'owner')
  with check (public.book_role(id) = 'owner' and owner_id = (select auth.uid()));

create policy "only the owner may delete a book"
  on public.books for delete to authenticated
  using (owner_id = (select auth.uid()));

-- -----------------------------------------------------------------------------
-- book_members
-- -----------------------------------------------------------------------------

create policy "members can see who else is in the book"
  on public.book_members for select to authenticated
  using (public.is_book_member(book_id));

-- Normal membership arrives through `public.accept_invitation`, which is a
-- definer function. This policy only covers an owner adding someone directly.
create policy "only the owner may add members"
  on public.book_members for insert to authenticated
  with check (public.book_role(book_id) = 'owner');

create policy "only the owner may change roles"
  on public.book_members for update to authenticated
  using (public.book_role(book_id) = 'owner' and role <> 'owner')
  with check (public.book_role(book_id) = 'owner' and role <> 'owner');

-- You can always leave a book; an owner can remove others. Neither can remove
-- the owner row itself, which keeps every book reachable by someone.
create policy "leave a book, or be removed by the owner"
  on public.book_members for delete to authenticated
  using (
    role <> 'owner'
    and (user_id = (select auth.uid()) or public.book_role(book_id) = 'owner')
  );

-- -----------------------------------------------------------------------------
-- book_invitations
--
-- Invitations are never selectable by the invitee before acceptance — they only
-- hold a hash, and reading one would leak the book's existence. Redemption goes
-- through the definer functions further down.
-- -----------------------------------------------------------------------------

create policy "members can see their book's invitations"
  on public.book_invitations for select to authenticated
  using (public.is_book_member(book_id));

create policy "only the owner may invite"
  on public.book_invitations for insert to authenticated
  with check (
    public.book_role(book_id) = 'owner'
    and created_by = (select auth.uid())
  );

create policy "only the owner may revoke an invitation"
  on public.book_invitations for update to authenticated
  using (public.book_role(book_id) = 'owner')
  with check (public.book_role(book_id) = 'owner');

create policy "only the owner may delete an invitation"
  on public.book_invitations for delete to authenticated
  using (public.book_role(book_id) = 'owner');

-- -----------------------------------------------------------------------------
-- entries
-- -----------------------------------------------------------------------------

create policy "entries are visible to members, minus drafts and sealed letters"
  on public.entries for select to authenticated
  using (
    public.is_book_member(book_id)
    -- An unfinished draft belongs to nobody but its writer.
    and (status = 'published' or author_id = (select auth.uid()))
    -- A sealed letter stays unreadable until its date, even for members. The
    -- author keeps access to their own writing.
    and (
      sealed_until is null
      or author_id = (select auth.uid())
      or sealed_until <= public.book_today(book_id)
    )
  );

create policy "members who can write may add their own entries"
  on public.entries for insert to authenticated
  with check (
    public.can_write_book(book_id)
    and author_id = (select auth.uid())
  );

-- Authors edit their own writing. Nobody edits somebody else's words.
create policy "authors may edit their own entries"
  on public.entries for update to authenticated
  using (author_id = (select auth.uid()) and public.can_write_book(book_id))
  with check (author_id = (select auth.uid()) and public.can_write_book(book_id));

create policy "authors and the book owner may delete an entry"
  on public.entries for delete to authenticated
  using (
    public.is_book_member(book_id)
    and (author_id = (select auth.uid()) or public.book_role(book_id) = 'owner')
  );

-- -----------------------------------------------------------------------------
-- entry_versions — append only. There is no update or delete policy, so history
-- cannot be rewritten by anyone holding an anon or authenticated key.
-- -----------------------------------------------------------------------------

create policy "versions follow the visibility of their entry"
  on public.entry_versions for select to authenticated
  using (
    public.is_book_member(book_id)
    and exists (select 1 from public.entries e where e.id = entry_versions.entry_id)
  );

create policy "writers may append versions"
  on public.entry_versions for insert to authenticated
  with check (
    public.can_write_book(book_id)
    and created_by = (select auth.uid())
  );

-- -----------------------------------------------------------------------------
-- attachments
-- -----------------------------------------------------------------------------

create policy "attachments follow the visibility of their entry"
  on public.attachments for select to authenticated
  using (
    public.is_book_member(book_id)
    and (
      entry_id is null
      or exists (select 1 from public.entries e where e.id = attachments.entry_id)
    )
  );

create policy "writers may attach files"
  on public.attachments for insert to authenticated
  with check (
    public.can_write_book(book_id)
    and uploader_id = (select auth.uid())
  );

create policy "uploaders and owners may remove attachments"
  on public.attachments for delete to authenticated
  using (
    public.is_book_member(book_id)
    and (uploader_id = (select auth.uid()) or public.book_role(book_id) = 'owner')
  );

-- -----------------------------------------------------------------------------
-- favorites — private to the person who marked them.
-- -----------------------------------------------------------------------------

create policy "your favorites are yours alone"
  on public.favorites for select to authenticated
  using (user_id = (select auth.uid()));

create policy "favorite entries in books you belong to"
  on public.favorites for insert to authenticated
  with check (user_id = (select auth.uid()) and public.is_book_member(book_id));

create policy "remove your own favorites"
  on public.favorites for delete to authenticated
  using (user_id = (select auth.uid()));

-- -----------------------------------------------------------------------------
-- entry_reactions
-- -----------------------------------------------------------------------------

create policy "reactions are visible to members"
  on public.entry_reactions for select to authenticated
  using (public.is_book_member(book_id));

create policy "react as yourself"
  on public.entry_reactions for insert to authenticated
  with check (user_id = (select auth.uid()) and public.is_book_member(book_id));

create policy "change your own reaction"
  on public.entry_reactions for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "remove your own reaction"
  on public.entry_reactions for delete to authenticated
  using (user_id = (select auth.uid()));

-- -----------------------------------------------------------------------------
-- milestones
-- -----------------------------------------------------------------------------

create policy "milestones are visible to members"
  on public.milestones for select to authenticated
  using (public.is_book_member(book_id));

create policy "writers may add milestones"
  on public.milestones for insert to authenticated
  with check (public.can_write_book(book_id) and created_by = (select auth.uid()));

create policy "authors and owners may edit milestones"
  on public.milestones for update to authenticated
  using (created_by = (select auth.uid()) or public.book_role(book_id) = 'owner')
  with check (public.is_book_member(book_id));

create policy "authors and owners may remove milestones"
  on public.milestones for delete to authenticated
  using (created_by = (select auth.uid()) or public.book_role(book_id) = 'owner');

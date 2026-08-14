-- =============================================================================
-- Journal & Letter — invitation redemption and read helpers
--
-- Invitation tokens: the raw token exists only inside the invite URL. The
-- database stores nothing but its SHA-256 hash, and the two functions below are
-- the *only* way to turn a raw token into anything. That means a leaked
-- database dump contains no usable invitations, and an attacker who can read
-- `book_invitations` still cannot join a book.
-- =============================================================================

create or replace function public.hash_invitation_token(p_token text)
returns text
language sql
immutable
set search_path = ''
as $$
  select encode(extensions.digest(p_token, 'sha256'), 'hex');
$$;

-- -----------------------------------------------------------------------------
-- invitation_preview
--
-- Shows just enough for the recipient to recognise the invitation — the book's
-- title and who sent it. Never returns entries, members or ids they cannot
-- already reach. Requires a logged-in caller, so an anonymous visitor cannot
-- probe tokens.
-- -----------------------------------------------------------------------------

create or replace function public.invitation_preview(p_token text)
returns table (
  status       text,
  book_title   text,
  book_subtitle text,
  book_type    public.book_type,
  inviter_name text,
  role         public.member_role,
  expires_at   timestamptz
)
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  v_uid    uuid := (select auth.uid());
  v_email  text;
  v_inv    public.book_invitations%rowtype;
  v_status text;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select u.email into v_email from auth.users u where u.id = v_uid;

  select * into v_inv
  from public.book_invitations i
  where i.token_hash = public.hash_invitation_token(p_token);

  if not found then
    -- Deliberately identical shape to a real answer so timing/response
    -- differences reveal as little as possible.
    return query select 'not_found'::text, null::text, null::text,
                        null::public.book_type, null::text,
                        null::public.member_role, null::timestamptz;
    return;
  end if;

  if v_inv.revoked_at is not null then
    v_status := 'revoked';
  elsif v_inv.accepted_at is not null then
    v_status := 'accepted';
  elsif v_inv.expires_at <= now() then
    v_status := 'expired';
  elsif v_inv.invited_email is not null and v_inv.invited_email <> lower(v_email) then
    v_status := 'wrong_email';
  elsif exists (
    select 1 from public.book_members m
    where m.book_id = v_inv.book_id and m.user_id = v_uid
  ) then
    v_status := 'already_member';
  else
    v_status := 'valid';
  end if;

  return query
    select v_status,
           b.title,
           b.subtitle,
           b.type,
           coalesce(p.display_name, 'A writer'),
           v_inv.role,
           v_inv.expires_at
    from public.books b
    left join public.profiles p on p.id = v_inv.created_by
    where b.id = v_inv.book_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- accept_invitation
--
-- Single-use. Marks the invitation consumed in the same statement that creates
-- the membership, so a token cannot be redeemed twice by racing requests.
-- -----------------------------------------------------------------------------

create or replace function public.accept_invitation(p_token text)
returns uuid
language plpgsql
security definer
volatile
set search_path = ''
as $$
declare
  v_uid   uuid := (select auth.uid());
  v_email text;
  v_inv   public.book_invitations%rowtype;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select u.email into v_email from auth.users u where u.id = v_uid;

  -- Lock the row so two simultaneous redemptions cannot both succeed.
  select * into v_inv
  from public.book_invitations i
  where i.token_hash = public.hash_invitation_token(p_token)
  for update;

  if not found then
    raise exception 'invitation_not_found' using errcode = 'P0002';
  end if;

  -- Already a member: treat as success and let the caller redirect to the book.
  if exists (
    select 1 from public.book_members m
    where m.book_id = v_inv.book_id and m.user_id = v_uid
  ) then
    return v_inv.book_id;
  end if;

  if v_inv.revoked_at is not null then
    raise exception 'invitation_revoked' using errcode = 'P0001';
  end if;
  if v_inv.accepted_at is not null then
    raise exception 'invitation_already_used' using errcode = 'P0001';
  end if;
  if v_inv.expires_at <= now() then
    raise exception 'invitation_expired' using errcode = 'P0001';
  end if;
  if v_inv.invited_email is not null and v_inv.invited_email <> lower(v_email) then
    raise exception 'invitation_wrong_email' using errcode = '42501';
  end if;

  insert into public.book_members (book_id, user_id, role)
  values (v_inv.book_id, v_uid, v_inv.role)
  on conflict (book_id, user_id) do nothing;

  update public.book_invitations
     set accepted_at = now(), accepted_by = v_uid
   where id = v_inv.id;

  return v_inv.book_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- sealed_entry_previews
--
-- The reading view still wants to show "a sealed letter lives here, it opens on
-- 1 January 2030". This returns that metadata and deliberately never returns
-- `content`, `plain_text` or `title`.
-- -----------------------------------------------------------------------------

create or replace function public.sealed_entry_previews(p_book_id uuid)
returns table (
  id           uuid,
  author_id    uuid,
  entry_date   date,
  sealed_until date
)
language sql
security definer
stable
set search_path = ''
as $$
  select e.id, e.author_id, e.entry_date, e.sealed_until
  from public.entries e
  where e.book_id = p_book_id
    and public.is_book_member(p_book_id)
    and e.status = 'published'
    and e.sealed_until is not null
    and e.sealed_until > public.book_today(p_book_id)
    and e.author_id <> (select auth.uid());
$$;

-- -----------------------------------------------------------------------------
-- Read helpers. These are SECURITY INVOKER (the default) on purpose: normal RLS
-- applies to every row they touch, so they can never widen access.
-- -----------------------------------------------------------------------------

create or replace function public.book_stats(p_book_id uuid)
returns table (
  entry_count      bigint,
  word_count       bigint,
  days_written     bigint,
  first_entry_date date,
  last_entry_date  date
)
language sql
stable
set search_path = ''
as $$
  select
    count(*)::bigint,
    coalesce(sum(
      coalesce(array_length(
        regexp_split_to_array(btrim(e.plain_text), '\s+'), 1
      ), 0)
    ), 0)::bigint,
    count(distinct e.entry_date)::bigint,
    min(e.entry_date),
    max(e.entry_date)
  from public.entries e
  where e.book_id = p_book_id
    and e.status = 'published';
$$;

-- Per-contributor counts for the quiet statistics panel.
create or replace function public.book_contributor_stats(p_book_id uuid)
returns table (
  author_id   uuid,
  entry_count bigint,
  word_count  bigint
)
language sql
stable
set search_path = ''
as $$
  select
    e.author_id,
    count(*)::bigint,
    coalesce(sum(
      coalesce(array_length(
        regexp_split_to_array(btrim(e.plain_text), '\s+'), 1
      ), 0)
    ), 0)::bigint
  from public.entries e
  where e.book_id = p_book_id
    and e.status = 'published'
  group by e.author_id;
$$;

-- Which days in a range contain writing, for the calendar grid.
create or replace function public.book_calendar(
  p_book_id uuid,
  p_from    date,
  p_to      date
)
returns table (
  entry_date  date,
  entry_count bigint,
  author_ids  uuid[]
)
language sql
stable
set search_path = ''
as $$
  select e.entry_date, count(*)::bigint, array_agg(distinct e.author_id)
  from public.entries e
  where e.book_id = p_book_id
    and e.status = 'published'
    and e.entry_date between p_from and p_to
  group by e.entry_date;
$$;

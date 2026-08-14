-- =============================================================================
-- Journal & Letter — aggregate read helpers
--
-- Both functions are SECURITY INVOKER (the default), so the `entries` RLS
-- policy scopes them to books the caller belongs to. They can never widen
-- access; they only save round trips.
-- =============================================================================

-- One aggregate for the whole Library screen, so rendering a shelf of books is
-- a single round trip instead of one query per card.
create or replace function public.library_overview()
returns table (
  book_id         uuid,
  entry_count     bigint,
  word_count      bigint,
  last_entry_date date,
  last_written_at timestamptz
)
language sql
stable
set search_path = ''
as $$
  select
    e.book_id,
    count(*)::bigint,
    coalesce(sum(
      coalesce(array_length(regexp_split_to_array(btrim(e.plain_text), '\s+'), 1), 0)
    ), 0)::bigint,
    max(e.entry_date),
    max(e.created_at)
  from public.entries e
  where e.status = 'published'
  group by e.book_id;
$$;

revoke execute on function public.library_overview() from public, anon, authenticated;
grant execute on function public.library_overview() to authenticated;

-- "On this day": entries from the same calendar day in earlier years, across
-- every book the caller can read.
create or replace function public.on_this_day(p_month integer, p_day integer)
returns table (
  id         uuid,
  book_id    uuid,
  author_id  uuid,
  entry_date date,
  title      text,
  plain_text text
)
language sql
stable
set search_path = ''
as $$
  select e.id, e.book_id, e.author_id, e.entry_date, e.title, left(e.plain_text, 400)
  from public.entries e
  where e.status = 'published'
    and extract(month from e.entry_date) = p_month
    and extract(day from e.entry_date) = p_day
  order by e.entry_date desc
  limit 50;
$$;

revoke execute on function public.on_this_day(integer, integer) from public, anon, authenticated;
grant execute on function public.on_this_day(integer, integer) to authenticated;

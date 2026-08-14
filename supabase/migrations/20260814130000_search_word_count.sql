-- How many times a word appears in a book.
--
-- Searching tells you *which* letters mention the ferry. This tells you how
-- often the ferry comes up at all, which is a different and rather more
-- interesting question once a book covers years.

-- -----------------------------------------------------------------------------
-- regexp_quote
--
-- A search box holds words, not patterns. Without this, searching for "l(" is a
-- syntax error rather than a search, and a term full of dots quietly matches
-- everything.
-- -----------------------------------------------------------------------------
create or replace function public.regexp_quote(p_value text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select regexp_replace(p_value, '([\\^$.|?*+()\[\]{}])', '\\\1', 'g');
$$;

comment on function public.regexp_quote(text) is
  'Escapes every regular-expression metacharacter, so a search term matches itself.';

-- -----------------------------------------------------------------------------
-- search_word_count
--
-- Deliberately `security invoker`: it reads `public.entries` directly, so row
-- level security applies exactly as it does everywhere else and the count can
-- never include an entry the caller is not allowed to read. Sealed letters are
-- withheld by the same policy that withholds them from the reading view, so
-- they cannot be counted either.
-- -----------------------------------------------------------------------------
create or replace function public.search_word_count(
  p_book_id uuid,
  p_term text,
  p_author uuid default null,
  p_from date default null,
  p_to date default null,
  p_tag text default null
)
returns table (occurrences bigint, entries bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  with needle as (
    select
      btrim(p_term) as term,
      case
        -- Whole words when the term begins and ends with one, so "ferry" does
        -- not also count "ferryman". A term starting or ending with punctuation
        -- gets no word boundary, because `\m` cannot match before one and the
        -- count would silently come back as zero.
        when btrim(p_term) ~ '^\w(.*\w)?$'
          then '\m' || public.regexp_quote(btrim(p_term)) || '\M'
        else public.regexp_quote(btrim(p_term))
      end as pattern
  )
  select
    coalesce(sum(regexp_count(e.plain_text, n.pattern, 1, 'i')), 0)::bigint,
    count(*)::bigint
  from public.entries e
  cross join needle n
  where e.book_id = p_book_id
    and e.status = 'published'
    and n.term <> ''
    and (p_author is null or e.author_id = p_author)
    and (p_from is null or e.entry_date >= p_from)
    and (p_to is null or e.entry_date <= p_to)
    and (p_tag is null or e.tags @> array[p_tag])
    and e.plain_text ~* n.pattern;
$$;

comment on function public.search_word_count(uuid, text, uuid, date, date, text) is
  'Occurrences of a term and the number of entries containing it. Runs as the caller, so RLS applies.';

revoke all on function public.regexp_quote(text) from public, anon;
grant execute on function public.regexp_quote(text) to authenticated;

revoke all on function public.search_word_count(uuid, text, uuid, date, date, text) from public, anon;
grant execute on function public.search_word_count(uuid, text, uuid, date, date, text) to authenticated;

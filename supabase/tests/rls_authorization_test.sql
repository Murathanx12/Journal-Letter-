-- =============================================================================
-- RELEASE-BLOCKING AUTHORIZATION TEST
--
-- The scenario this file exists to prove:
--
--   User A keeps a private book.
--   User B signs in and goes looking for it — by id, by unfiltered select, by
--   writing to it, by adding themselves as a member.
--   Expected result at every turn: nothing.
--
-- It tests the policies *directly*, by becoming the `authenticated` role and
-- setting the same JWT claims PostgREST sets. That is stronger than testing
-- through the application: it proves the database refuses, so the guarantee
-- holds even if a bug in the app sends a query it should not have.
--
-- Safe to run against any environment: everything happens inside a transaction
-- that is rolled back at the end, so no rows survive.
--
-- HOW TO RUN
--   Supabase Studio -> SQL Editor -> paste and run, or:
--     psql "$DATABASE_URL" -f supabase/tests/rls_authorization_test.sql
--
-- Every row of the final result must show passed = true.
-- =============================================================================

begin;

create temp table rls_results (name text, passed boolean, detail text) on commit drop;
grant select, insert on rls_results to authenticated, anon;

-- --- Setup, as the privileged role (bypasses RLS) ----------------------------

insert into auth.users (id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'user-a@rlstest.invalid', 'x', now(), now()),
  ('bbbbbbbb-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'user-b@rlstest.invalid', 'x', now(), now());

-- A's strictly private journal, with an entry and an attachment.
insert into public.books (id, owner_id, type, title, timezone)
values ('cccccccc-0000-4000-8000-000000000003', 'aaaaaaaa-0000-4000-8000-000000000001', 'personal_journal', 'A private journal', 'UTC');

insert into public.entries (id, book_id, author_id, entry_date, content, plain_text)
values ('dddddddd-0000-4000-8000-000000000004', 'cccccccc-0000-4000-8000-000000000003', 'aaaaaaaa-0000-4000-8000-000000000001',
        '2026-08-14', '{"type":"doc","content":[]}'::jsonb, 'the secret text of a private letter');

insert into public.attachments (id, book_id, entry_id, uploader_id, storage_path, mime_type, byte_size)
values ('eeeeeeee-0000-4000-8000-000000000005', 'cccccccc-0000-4000-8000-000000000003', 'dddddddd-0000-4000-8000-000000000004',
        'aaaaaaaa-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000003/private.jpg', 'image/jpeg', 1234);

-- A shared book B has been invited to but has NOT yet accepted.
insert into public.books (id, owner_id, type, title, timezone)
values ('ffffffff-0000-4000-8000-000000000006', 'aaaaaaaa-0000-4000-8000-000000000001', 'shared_letter_book', 'Our Letters', 'Asia/Hong_Kong');

insert into public.entries (id, book_id, author_id, entry_date, content, plain_text)
values ('99999999-0000-4000-8000-000000000007', 'ffffffff-0000-4000-8000-000000000006', 'aaaaaaaa-0000-4000-8000-000000000001',
        '2026-08-14', '{"type":"doc","content":[]}'::jsonb, 'a letter in the shared book');

-- A sealed letter, which must stay unreadable even for an accepted member.
insert into public.entries (id, book_id, author_id, entry_date, content, plain_text, sealed_until)
values ('88888888-0000-4000-8000-000000000008', 'ffffffff-0000-4000-8000-000000000006', 'aaaaaaaa-0000-4000-8000-000000000001',
        '2026-08-14', '{"type":"doc","content":[]}'::jsonb, 'open on our anniversary', '2030-01-01');

-- --- Become User B, exactly as PostgREST would -------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub":"bbbbbbbb-0000-4000-8000-000000000002","role":"authenticated"}';

insert into rls_results
select 'B cannot read A private book row', count(*) = 0, 'rows=' || count(*)
from public.books where id = 'cccccccc-0000-4000-8000-000000000003';

insert into rls_results
select 'B cannot read entries in A private book', count(*) = 0, 'rows=' || count(*)
from public.entries where book_id = 'cccccccc-0000-4000-8000-000000000003';

insert into rls_results
select 'B cannot read ANY entry via unfiltered select', count(*) = 0, 'rows=' || count(*)
from public.entries;

insert into rls_results
select 'B cannot read attachments', count(*) = 0, 'rows=' || count(*)
from public.attachments;

insert into rls_results
select 'B cannot read shared book before accepting', count(*) = 0, 'rows=' || count(*)
from public.books where id = 'ffffffff-0000-4000-8000-000000000006';

insert into rls_results
select 'B cannot read A profile without a shared book', count(*) = 0, 'rows=' || count(*)
from public.profiles where id = 'aaaaaaaa-0000-4000-8000-000000000001';

insert into rls_results
select 'B cannot read A book membership', count(*) = 0, 'rows=' || count(*)
from public.book_members where book_id = 'cccccccc-0000-4000-8000-000000000003';

insert into rls_results
select 'B cannot read invitation tokens', count(*) = 0, 'rows=' || count(*)
from public.book_invitations;

-- Writes must be refused, not silently ignored.
do $$
begin
  insert into public.entries (book_id, author_id, entry_date, content, plain_text)
  values ('cccccccc-0000-4000-8000-000000000003', 'bbbbbbbb-0000-4000-8000-000000000002',
          '2026-08-14', '{"type":"doc"}'::jsonb, 'B writing into A journal');
  insert into rls_results values ('B cannot write into A private book', false, 'INSERT SUCCEEDED');
exception when others then
  insert into rls_results values ('B cannot write into A private book', true, 'refused: ' || sqlstate);
end $$;

do $$
declare affected int;
begin
  update public.entries set plain_text = 'tampered' where id = 'dddddddd-0000-4000-8000-000000000004';
  get diagnostics affected = row_count;
  insert into rls_results values ('B cannot edit A entry', affected = 0, 'rows updated=' || affected);
end $$;

do $$
declare affected int;
begin
  delete from public.entries where id = 'dddddddd-0000-4000-8000-000000000004';
  get diagnostics affected = row_count;
  insert into rls_results values ('B cannot delete A entry', affected = 0, 'rows deleted=' || affected);
end $$;

do $$
begin
  insert into public.book_members (book_id, user_id, role)
  values ('cccccccc-0000-4000-8000-000000000003', 'bbbbbbbb-0000-4000-8000-000000000002', 'editor');
  insert into rls_results values ('B cannot add themselves as a member', false, 'INSERT SUCCEEDED');
exception when others then
  insert into rls_results values ('B cannot add themselves as a member', true, 'refused: ' || sqlstate);
end $$;

-- --- B accepts the invitation and becomes a member ---------------------------

reset role;
insert into public.book_members (book_id, user_id, role)
values ('ffffffff-0000-4000-8000-000000000006', 'bbbbbbbb-0000-4000-8000-000000000002', 'editor');

set local role authenticated;
set local request.jwt.claims = '{"sub":"bbbbbbbb-0000-4000-8000-000000000002","role":"authenticated"}';

insert into rls_results
select 'B CAN read shared book once a member', count(*) = 1, 'rows=' || count(*)
from public.books where id = 'ffffffff-0000-4000-8000-000000000006';

insert into rls_results
select 'B CAN read unsealed shared entries', count(*) = 1, 'rows=' || count(*)
from public.entries where book_id = 'ffffffff-0000-4000-8000-000000000006';

insert into rls_results
select 'B still cannot read the sealed letter', count(*) = 0, 'rows=' || count(*)
from public.entries where id = '88888888-0000-4000-8000-000000000008';

insert into rls_results
select 'B CAN now read A profile (shared book)', count(*) = 1, 'rows=' || count(*)
from public.profiles where id = 'aaaaaaaa-0000-4000-8000-000000000001';

-- Membership in one book must not leak another.
insert into rls_results
select 'B still cannot read A OTHER private book', count(*) = 0, 'rows=' || count(*)
from public.books where id = 'cccccccc-0000-4000-8000-000000000003';

insert into rls_results
select 'B still cannot read private book entries', count(*) = 0, 'rows=' || count(*)
from public.entries where book_id = 'cccccccc-0000-4000-8000-000000000003';

do $$
declare affected int;
begin
  update public.entries set plain_text = 'tampered' where id = '99999999-0000-4000-8000-000000000007';
  get diagnostics affected = row_count;
  insert into rls_results values ('Member cannot edit another persons letter', affected = 0, 'rows updated=' || affected);
end $$;

-- --- The owner's own access ---------------------------------------------------
--
-- `books` has a second SELECT policy so an owner can read a book they own even
-- before the membership trigger has run. Without it, `INSERT ... RETURNING id`
-- fails and creating a book returns 403. These assert that it works and that it
-- widens nothing for anybody else.

reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}';

insert into rls_results
select 'A can read the book A owns', count(*) = 1, 'rows=' || count(*)
from public.books where id = 'cccccccc-0000-4000-8000-000000000003';

do $$
declare v_id uuid;
begin
  insert into public.books (owner_id, type, title, timezone)
  values ('aaaaaaaa-0000-4000-8000-000000000001', 'personal_journal', 'Returning probe', 'UTC')
  returning id into v_id;
  insert into rls_results values ('Owner can INSERT..RETURNING a new book', v_id is not null, 'id returned');
exception when others then
  insert into rls_results values ('Owner can INSERT..RETURNING a new book', false, 'refused: ' || sqlstate);
end $$;

-- --- Anonymous ---------------------------------------------------------------

reset role;
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';

do $$
declare n int;
begin
  select count(*) into n from public.entries;
  insert into rls_results values ('Anonymous cannot read entries', n = 0, 'rows=' || n);
exception when others then
  insert into rls_results values ('Anonymous cannot read entries', true, 'refused: ' || sqlstate);
end $$;

do $$
declare n int;
begin
  select count(*) into n from public.books;
  insert into rls_results values ('Anonymous cannot read books', n = 0, 'rows=' || n);
exception when others then
  insert into rls_results values ('Anonymous cannot read books', true, 'refused: ' || sqlstate);
end $$;

-- --- Report ------------------------------------------------------------------

reset role;

select
  count(*) filter (where passed) || ' of ' || count(*) || ' passed' as summary,
  bool_and(passed) as all_passed
from rls_results;

select name, passed, detail from rls_results order by passed, name;

-- Nothing is kept.
rollback;

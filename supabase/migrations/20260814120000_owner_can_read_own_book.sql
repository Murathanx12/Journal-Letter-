-- =============================================================================
-- Journal & Letter — an owner can always read their own book
--
-- Creating a book was failing with 403.
--
-- `INSERT ... RETURNING id` — which is what PostgREST issues for
-- `.insert().select("id")` — evaluates the SELECT policy against the new row
-- *before* the AFTER-INSERT trigger has created the owner's `book_members`
-- row. So `is_book_member(id)` was still false and the owner could not read
-- back the book they had just created.
--
-- Ownership is an independent, sufficient reason to see a book, so it gets its
-- own policy. Permissive policies are OR-ed together, which also makes a book
-- reachable if its membership row is ever missing. Nothing widens for anybody
-- else: a non-owner who is not a member still matches neither policy, which
-- `supabase/tests/rls_authorization_test.sql` continues to assert.
-- =============================================================================

create policy "owners can always read their own books"
  on public.books for select to authenticated
  using (owner_id = (select auth.uid()));

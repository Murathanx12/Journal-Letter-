-- =============================================================================
-- Journal & Letter — least-privilege EXECUTE grants
--
-- Postgres grants EXECUTE to PUBLIC on every new function. For SECURITY DEFINER
-- functions that is too generous — it publishes them all at
-- `/rest/v1/rpc/<name>`, including internal trigger helpers. So we start from
-- nothing and grant back only what a signed-in user genuinely needs.
-- =============================================================================

revoke execute on function
  public.is_book_member(uuid),
  public.book_role(uuid),
  public.can_write_book(uuid),
  public.shares_book_with(uuid),
  public.book_today(uuid),
  public.storage_path_book_id(text),
  public.hash_invitation_token(text),
  public.invitation_preview(text),
  public.accept_invitation(text),
  public.sealed_entry_previews(uuid),
  public.book_stats(uuid),
  public.book_contributor_stats(uuid),
  public.book_calendar(uuid, date, date),
  public.handle_new_user(),
  public.handle_new_book(),
  public.touch_updated_at()
from public, anon, authenticated;

-- Authorization helpers must stay executable by `authenticated`: RLS policy
-- expressions are evaluated as the calling role, so revoking these would make
-- every policy fail closed with "permission denied" rather than simply
-- returning no rows.
grant execute on function
  public.is_book_member(uuid),
  public.book_role(uuid),
  public.can_write_book(uuid),
  public.shares_book_with(uuid),
  public.book_today(uuid),
  public.storage_path_book_id(text)
to authenticated;

-- Application-facing RPCs. Each one re-checks membership or authentication
-- internally; none of them is reachable by `anon`.
grant execute on function
  public.invitation_preview(text),
  public.accept_invitation(text),
  public.sealed_entry_previews(uuid),
  public.book_stats(uuid),
  public.book_contributor_stats(uuid),
  public.book_calendar(uuid, date, date)
to authenticated;

-- `hash_invitation_token`, `handle_new_user`, `handle_new_book` and
-- `touch_updated_at` are internal. Trigger functions have their EXECUTE
-- privilege checked at CREATE TRIGGER time, not per row, so the existing
-- triggers keep working with no grant at all.

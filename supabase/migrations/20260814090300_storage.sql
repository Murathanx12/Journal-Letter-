-- =============================================================================
-- Journal & Letter — private media storage
--
-- Photographs, tickets and scans attached to letters are as private as the
-- letters themselves, so the bucket is NOT public and is read through short-
-- lived signed URLs only.
--
-- Every object path begins with the owning book's id:
--
--     <book_id>/<entry_id or 'loose'>/<random>.<ext>
--
-- which lets the policies authorize from the first path segment without
-- touching the attachments table.
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'book-media',
  'book-media',
  false,
  10485760, -- 10 MB
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'application/pdf']
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Returns the book id from an object path, or NULL when the path is malformed.
-- Returning NULL rather than raising means a bad path simply fails to match any
-- policy instead of erroring out of the query.
create or replace function public.storage_path_book_id(p_name text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_first text := split_part(p_name, '/', 1);
begin
  if v_first ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return v_first::uuid;
  end if;
  return null;
end;
$$;

create policy "book media is readable by book members"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'book-media'
    and public.is_book_member(public.storage_path_book_id(name))
  );

create policy "book writers may upload media"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'book-media'
    and public.can_write_book(public.storage_path_book_id(name))
  );

create policy "book writers may replace their media"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'book-media'
    and public.can_write_book(public.storage_path_book_id(name))
  )
  with check (
    bucket_id = 'book-media'
    and public.can_write_book(public.storage_path_book_id(name))
  );

create policy "book writers may delete media"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'book-media'
    and public.can_write_book(public.storage_path_book_id(name))
  );

-- =============================================================================
-- Journal & Letter — page layout for photographs
--
-- Where photographs sit on the page.
--
-- Kept separate from `content` because it is a different kind of thing: the
-- rich-text document is what the entry *says*, and this is how the page is
-- arranged. Keeping them apart means an export, a search index or a plain-text
-- reader can ignore the layout entirely, and a layout mistake can never damage
-- the writing.
-- =============================================================================

alter table public.entries
  add column if not exists layout jsonb not null default '[]'::jsonb;

comment on column public.entries.layout is
  'Array of placed media items: position, size, rotation, mask, layer and text-wrap.';

-- Attachments already carry the book id, but the editor needs to list the
-- images belonging to one entry quickly while somebody is arranging a page.
create index if not exists attachments_entry_created_idx
  on public.attachments (entry_id, created_at);

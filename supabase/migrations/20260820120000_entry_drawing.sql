-- Freehand drawing on the pages of an entry.
--
-- A separate column from `layout` rather than another kind of item inside it.
-- The two are read at different times and by different code — `layout` is
-- parsed into `PlacedMedia` on every render of every entry, and a drawing is a
-- much larger value that a book with no drawings should never pay to decode.
-- Mixing them would also mean `parseLayout` had to branch on a discriminator
-- before it could clamp anything.
--
-- Shape (validated in `parseDrawing`, never trusted from the row):
--
--   [{ id, page, layer: 'behind' | 'front', colour, width, opacity,
--      points: [x0, y0, x1, y1, …] }]
--
-- Every coordinate is a fraction of the page, so a drawing made on a phone is
-- the same drawing on a laptop and in a printed copy.
--
-- No new policies are needed: this is a column on `entries`, and the existing
-- row-level policies already decide who may read and write that row. Adding a
-- column to a table with RLS enabled does not widen access.

alter table public.entries
  add column if not exists drawing jsonb not null default '[]'::jsonb;

comment on column public.entries.drawing is
  'Freehand strokes drawn on this entry''s pages. Coordinates are fractions of a page. See lib/media/drawing.ts.';

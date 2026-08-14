-- =============================================================================
-- Journal & Letter — cover presets reworked
--
-- The palette moved off the warm/brown set. The column default named a preset
-- that no longer exists; unknown presets already fall back safely when parsed,
-- but the default should name a real one.
-- =============================================================================

alter table public.books
  alter column cover set default '{"preset":"paper","imagePath":null}'::jsonb;

update public.books
   set cover = jsonb_set(cover, '{preset}', '"paper"')
 where cover ->> 'preset' in ('linen', 'oxblood');

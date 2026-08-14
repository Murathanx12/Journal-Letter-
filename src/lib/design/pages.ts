/**
 * How tall a page is.
 *
 * One value, shared by the reading view, the composer and the photo arranger,
 * because a photograph placed a third of the way down a page has to land in the
 * same place in all three. It is expressed as a `clamp` so a page fills a phone
 * screen without becoming absurd on a large monitor, and in `rem` at the ends so
 * it grows with the reader's own font size rather than fighting it.
 */
export const PAGE_HEIGHT = "clamp(24rem, 56vh, 38rem)";

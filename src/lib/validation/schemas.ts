import { z } from "zod";

import {
  ACCENT_IDS,
  COVER_PRESET_IDS,
  FONT_IDS,
  PRESET_IDS,
  TITLE_SIZE_RANGE,
  TITLE_WEIGHTS,
} from "@/lib/design/theme";
import { isCalendarDate, isValidTimezone } from "@/lib/date/calendar-date";

/**
 * Every server action and route handler validates its input here before it
 * reaches Postgres. RLS already decides *who* may write; these schemas decide
 * *what* is a sensible thing to write, and give the UI a readable error rather
 * than a constraint-violation stack trace.
 */

export const calendarDate = z
  .string()
  .refine(isCalendarDate, { message: "Use a real date in YYYY-MM-DD form." });

export const timezone = z
  .string()
  .min(1)
  .refine(isValidTimezone, { message: "Unknown timezone." });

export const richTextDoc = z
  .object({ type: z.literal("doc") })
  .loose()
  .transform((value) => value as { type: "doc"; content?: unknown[] });

const nonEmpty = (max: number) => z.string().trim().min(1).max(max);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value.length === 0 ? null : value))
    .nullable();

// -----------------------------------------------------------------------------
// Books
// -----------------------------------------------------------------------------

export const bookTypeSchema = z.enum(["personal_journal", "shared_letter_book"]);

export const createBookSchema = z.object({
  type: bookTypeSchema,
  title: nonEmpty(120),
  subtitle: optionalText(160).optional().default(null),
  description: optionalText(600).optional().default(null),
  timezone,
  coverPreset: z.enum(COVER_PRESET_IDS as [string, ...string[]]),
  designPreset: z.enum(PRESET_IDS as [string, ...string[]]),
  /** Optional email to invite immediately, for shared books. */
  inviteEmail: z.email().toLowerCase().optional().or(z.literal("")).transform((v) => (v ? v : null)),
});

export type CreateBookInput = z.infer<typeof createBookSchema>;

export const updateBookSchema = z.object({
  bookId: z.uuid(),
  title: nonEmpty(120),
  subtitle: optionalText(160),
  description: optionalText(600),
  timezone,
  coverPreset: z.enum(COVER_PRESET_IDS as [string, ...string[]]),
  designPreset: z.enum(PRESET_IDS as [string, ...string[]]),
  bodyFont: z.enum(FONT_IDS as [string, ...string[]]).nullable(),
  headingFont: z.enum(FONT_IDS as [string, ...string[]]).nullable(),
  baseSize: z.coerce.number().min(13).max(26).nullable(),
  lineHeight: z.coerce.number().min(1.3).max(2.4).nullable(),
  /** A multiple of the body size, so titles scale with the reader's text size. */
  titleSize: z.coerce.number().min(TITLE_SIZE_RANGE.min).max(TITLE_SIZE_RANGE.max).nullable(),
  titleWeight: z.coerce
    .number()
    .refine((value) => TITLE_WEIGHTS.includes(value as (typeof TITLE_WEIGHTS)[number]), {
      message: "Pick one of the offered weights.",
    })
    .nullable(),
  perAuthorFonts: z.boolean(),
  showSignatures: z.boolean(),
  pageSize: z.enum(["A5", "A4", "LETTER", "DIGEST"]),
});

// -----------------------------------------------------------------------------
// Entries
// -----------------------------------------------------------------------------

/**
 * Page layout arrives as loose objects and is normalised server-side by
 * `parseLayout`, which clamps every number and drops anything unrecognised.
 * Validating the shape here as well would mean maintaining the same rules
 * twice.
 */
export const layoutSchema = z.array(z.looseObject({})).max(40).default([]);

/**
 * Freehand strokes, normalised server-side by `parseDrawing` for the same
 * reason. The cap here is a cheap upper bound on the request body; the real
 * limits on stroke and point counts live there.
 */
export const drawingSchema = z.array(z.looseObject({})).max(300).default([]);

export const saveEntrySchema = z.object({
  bookId: z.uuid(),
  /** Absent when creating. */
  entryId: z.uuid().optional(),
  layout: layoutSchema,
  drawing: drawingSchema,
  entryDate: calendarDate,
  title: optionalText(160),
  content: richTextDoc,
  status: z.enum(["draft", "published"]),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  mood: optionalText(40),
  location: optionalText(120),
  /** A letter that stays unreadable until this date. */
  sealedUntil: calendarDate.nullable().optional().default(null),
});

export type SaveEntryInput = z.infer<typeof saveEntrySchema>;

export const reorderEntrySchema = z.object({
  bookId: z.uuid(),
  entryId: z.uuid(),
  direction: z.enum(["up", "down"]),
});

export const deleteEntrySchema = z.object({
  bookId: z.uuid(),
  entryId: z.uuid(),
});

// -----------------------------------------------------------------------------
// Bulk import
// -----------------------------------------------------------------------------

export const importedEntrySchema = z.object({
  entryDate: calendarDate,
  title: z.string().trim().max(160).nullable().default(null),
  body: z.string().trim().min(1),
});

export const bulkImportSchema = z.object({
  bookId: z.uuid(),
  entries: z.array(importedEntrySchema).min(1).max(200),
});

// -----------------------------------------------------------------------------
// Invitations & members
// -----------------------------------------------------------------------------

export const createInvitationSchema = z.object({
  bookId: z.uuid(),
  /** Null means "anyone holding the link", which is why links expire. */
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(200)
    .transform((v) => (v.length === 0 ? null : v))
    .nullable()
    .refine((v) => v === null || z.email().safeParse(v).success, {
      message: "That does not look like an email address.",
    }),
  role: z.enum(["editor", "viewer"]),
  expiresInDays: z.coerce.number().int().min(1).max(90).default(14),
});

export const revokeInvitationSchema = z.object({
  bookId: z.uuid(),
  invitationId: z.uuid(),
});

export const memberActionSchema = z.object({
  bookId: z.uuid(),
  userId: z.uuid(),
});

export const changeRoleSchema = memberActionSchema.extend({
  role: z.enum(["editor", "viewer"]),
});

// -----------------------------------------------------------------------------
// Profile
// -----------------------------------------------------------------------------

export const updateProfileSchema = z.object({
  displayName: nonEmpty(80),
  signature: optionalText(80),
  preferredFont: z.enum(FONT_IDS as [string, ...string[]]),
  accent: z.enum(ACCENT_IDS as [string, ...string[]]),
});

// -----------------------------------------------------------------------------
// Proofreading
// -----------------------------------------------------------------------------

export const proofreadModeSchema = z.enum(["gentle", "polish"]);

export const proofreadRequestSchema = z.object({
  bookId: z.uuid(),
  /** Sent directly from the editor, so an unsaved draft can be checked too. */
  text: z.string().min(1).max(20000),
  mode: proofreadModeSchema,
});

export const applyCorrectionSchema = z.object({
  bookId: z.uuid(),
  entryId: z.uuid(),
  content: richTextDoc,
  mode: proofreadModeSchema,
});

// -----------------------------------------------------------------------------
// Search & export
// -----------------------------------------------------------------------------

export const searchSchema = z.object({
  q: z.string().trim().max(200).default(""),
  bookId: z.uuid().optional(),
  authorId: z.uuid().optional(),
  from: calendarDate.optional(),
  to: calendarDate.optional(),
  tag: z.string().trim().max(40).optional(),
});

export const exportRequestSchema = z.object({
  bookId: z.uuid(),
  format: z.enum(["pdf", "docx", "google-docs"]),
  /** Which words to print: the author's own, or the corrected version. */
  textVersion: z.enum(["original", "current"]).default("current"),
  from: calendarDate.optional(),
  to: calendarDate.optional(),
  includeImages: z.boolean().default(true),
  includeCover: z.boolean().default(true),
});

export type ExportRequest = z.infer<typeof exportRequestSchema>;

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

/**
 * Turn a Zod failure into `{ field: message }` for rendering next to inputs.
 */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const result: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "form";
    result[key] ??= issue.message;
  }
  return result;
}

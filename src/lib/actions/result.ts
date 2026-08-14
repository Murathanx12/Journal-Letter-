/**
 * A single shape for everything a server action can return, so forms handle
 * success and failure the same way everywhere.
 *
 * Errors are always human-readable strings meant to be shown to the person who
 * triggered them. Database errors are deliberately *not* passed through — a
 * Postgres message can name columns and constraints, and this application holds
 * private writing.
 */

export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

export function ok(): ActionResult<undefined>;
export function ok<T>(data: T): ActionResult<T>;
export function ok<T>(data?: T): ActionResult<T | undefined> {
  return { ok: true, data };
}

export function fail(error: string, fieldErrors?: Record<string, string>): ActionResult<never> {
  return { ok: false, error, fieldErrors };
}

/**
 * What to tell the user when Postgres refuses.
 *
 * An RLS denial arrives as an ordinary error; we never want to say "row level
 * security policy violated", both because it is meaningless to a reader and
 * because it confirms that the row exists.
 */
export function describeDatabaseError(error: { code?: string; message?: string } | null): string {
  if (!error) return "Something went wrong. Please try again.";

  switch (error.code) {
    case "42501": // insufficient_privilege — an RLS policy said no
      return "You do not have permission to do that.";
    case "23505": // unique_violation
      return "That already exists.";
    case "23503": // foreign_key_violation
      return "That refers to something which no longer exists.";
    case "23514": // check_violation
      return "Some of those details are not valid.";
    case "P0002": // no_data_found, raised by accept_invitation
      return "That invitation could not be found.";
    default:
      return "Something went wrong. Please try again.";
  }
}

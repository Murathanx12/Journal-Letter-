/**
 * Name of the short-lived, httpOnly cookie that carries an in-progress Google
 * Docs export between `/api/google/authorize` and `/api/google/callback`.
 *
 * It lives here rather than in either route module because a `route.ts` file is
 * only allowed to export route handlers and a fixed set of segment options —
 * an extra named export fails Next's route type check at build time.
 */
export const GOOGLE_EXPORT_COOKIE = "jl_google_export";

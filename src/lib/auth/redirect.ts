/**
 * Where to send someone after they sign in.
 *
 * The `next` parameter is attacker-controllable — invitation links carry it, and
 * anyone can craft a `/login?next=…` URL. Reflecting that straight into a
 * redirect is a textbook open redirect, so only same-origin absolute paths get
 * through and everything else falls back to the library.
 *
 * This lives outside `actions.ts` because a `"use server"` module may only
 * export async functions.
 */
export function safeNextPath(value: string | null | undefined): string {
  if (!value) return "/library";
  if (!value.startsWith("/")) return "/library";
  // `//evil.com` and `/\evil.com` are both treated as absolute URLs by browsers.
  if (value.startsWith("//") || value.startsWith("/\\")) return "/library";
  return value;
}

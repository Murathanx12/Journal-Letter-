import "server-only";

import { createHash, randomBytes } from "node:crypto";

/**
 * Invitation tokens.
 *
 * The raw token is generated here, put in exactly one place — the invite URL —
 * and then forgotten. Only its SHA-256 hash is stored, and the hash is never
 * accepted as proof of anything: `accept_invitation(p_token)` re-hashes the raw
 * token inside Postgres. So reading the database gives an attacker hashes, and
 * hashes are useless.
 *
 * 32 random bytes is 256 bits of entropy — far beyond guessable, and short
 * enough to survive being pasted into a chat message.
 */

export function generateInvitationToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Must match `public.hash_invitation_token` exactly. */
export function hashInvitationToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function invitationUrl(siteUrl: string, token: string): string {
  return `${siteUrl.replace(/\/$/, "")}/invitations/${encodeURIComponent(token)}`;
}

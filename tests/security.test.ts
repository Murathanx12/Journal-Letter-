import { describe, expect, it } from "vitest";

import { safeNextPath } from "@/lib/auth/redirect";
import { generateInvitationToken, hashInvitationToken, invitationUrl } from "@/lib/invitations/tokens";
import { parseCover, parseDesign } from "@/lib/design/theme";

/**
 * Security-relevant logic that can be tested without a database.
 *
 * The authorization guarantees themselves live in Postgres and are proved by
 * `supabase/tests/rls_authorization_test.sql`, which impersonates a second user
 * and confirms they receive nothing.
 */

describe("safeNextPath", () => {
  it("keeps ordinary in-app destinations", () => {
    expect(safeNextPath("/library")).toBe("/library");
    expect(safeNextPath("/invitations/abc123")).toBe("/invitations/abc123");
    expect(safeNextPath("/books/1/read?spread=1")).toBe("/books/1/read?spread=1");
  });

  it("refuses to redirect off-site", () => {
    // Invitation links carry `next`, so this parameter is attacker-supplied.
    expect(safeNextPath("https://evil.example/phish")).toBe("/library");
    expect(safeNextPath("//evil.example/phish")).toBe("/library");
    expect(safeNextPath("/\\evil.example")).toBe("/library");
    expect(safeNextPath("javascript:alert(1)")).toBe("/library");
    expect(safeNextPath("http://evil.example")).toBe("/library");
  });

  it("falls back for missing or relative values", () => {
    expect(safeNextPath(null)).toBe("/library");
    expect(safeNextPath(undefined)).toBe("/library");
    expect(safeNextPath("")).toBe("/library");
    expect(safeNextPath("library")).toBe("/library");
  });
});

describe("invitation tokens", () => {
  it("generates long, unguessable, URL-safe tokens", () => {
    const token = generateInvitationToken();

    // 32 random bytes in base64url.
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(token.length).toBeGreaterThanOrEqual(42);
  });

  it("never repeats", () => {
    const tokens = new Set(Array.from({ length: 500 }, () => generateInvitationToken()));
    expect(tokens.size).toBe(500);
  });

  it("hashes deterministically, so Postgres and Node agree", () => {
    // Must match `public.hash_invitation_token`, which is
    // encode(digest(token,'sha256'),'hex').
    expect(hashInvitationToken("hello")).toBe(
      "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
    );
    expect(hashInvitationToken("a")).toHaveLength(64);
  });

  it("produces a different hash for a different token", () => {
    expect(hashInvitationToken("token-a")).not.toBe(hashInvitationToken("token-b"));
  });

  it("builds an invitation URL without a doubled slash", () => {
    expect(invitationUrl("https://example.com/", "abc")).toBe("https://example.com/invitations/abc");
    expect(invitationUrl("https://example.com", "abc")).toBe("https://example.com/invitations/abc");
  });

  it("escapes a token safely into the path", () => {
    expect(invitationUrl("https://example.com", "a/b+c")).toBe(
      "https://example.com/invitations/a%2Fb%2Bc",
    );
  });
});

describe("settings parsing", () => {
  it("falls back to sane defaults for junk stored in jsonb", () => {
    // A hand-edited or older row must never blank out a page.
    expect(parseCover(null).preset).toBe("linen");
    expect(parseCover({ preset: "not-a-preset" }).preset).toBe("linen");
    expect(parseCover("nonsense").imagePath).toBeNull();
    expect(parseDesign(undefined).preset).toBe("classic-novel");
    expect(parseDesign({ preset: "romantic" }).preset).toBe("romantic");
  });

  it("rejects out-of-range typography values", () => {
    expect(parseDesign({ baseSize: 400 }).baseSize).toBeNull();
    expect(parseDesign({ baseSize: 19 }).baseSize).toBe(19);
    expect(parseDesign({ lineHeight: 99 }).lineHeight).toBeNull();
    expect(parseDesign({ pageSize: "BILLBOARD" }).pageSize).toBe("A5");
  });

  it("defaults the author-identity options to on", () => {
    const design = parseDesign({});
    expect(design.perAuthorFonts).toBe(true);
    expect(design.showSignatures).toBe(true);
  });
});

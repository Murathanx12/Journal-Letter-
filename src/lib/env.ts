import "server-only";

/**
 * Server-side environment access.
 *
 * Anything read through this module is available only on the server. The two
 * `NEXT_PUBLIC_` values are re-exported from `publicEnv` below because Next
 * inlines them at build time and they are safe to ship to the browser — the
 * publishable key is powerless without a session, since every table is behind
 * Row Level Security.
 *
 * Privileged values (AI keys, Google client secret) are read lazily and are
 * never imported from a Client Component.
 */

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `Missing required environment variable ${name}. Copy .env.example to .env.local and fill it in.`,
    );
  }
  return value;
}

export const serverEnv = {
  get supabaseUrl() {
    return required("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL);
  },
  get supabasePublishableKey() {
    return required(
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    );
  },
  get siteUrl() {
    // On Vercel, VERCEL_PROJECT_PRODUCTION_URL is set automatically, which keeps
    // preview deployments working without extra configuration.
    const explicit = process.env.NEXT_PUBLIC_SITE_URL;
    if (explicit) return explicit.replace(/\/$/, "");
    const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
    if (vercel) return `https://${vercel}`;
    return "http://localhost:3000";
  },

  /** Optional. When absent, AI proofreading is disabled rather than faked. */
  get anthropicApiKey() {
    return process.env.ANTHROPIC_API_KEY ?? null;
  },
  get proofreadModel() {
    return process.env.PROOFREAD_MODEL ?? "claude-sonnet-5";
  },

  /** Optional. When absent, the Google Docs export button explains the setup. */
  get googleDocsClientId() {
    return process.env.GOOGLE_DOCS_CLIENT_ID ?? null;
  },
  get googleDocsClientSecret() {
    return process.env.GOOGLE_DOCS_CLIENT_SECRET ?? null;
  },
} as const;

export const featureFlags = {
  get aiProofreading() {
    return Boolean(serverEnv.anthropicApiKey);
  },
  /**
   * "Continue with Google" is hidden until the provider is actually enabled in
   * the Supabase dashboard. Offering a button that can only ever answer
   * `provider is not enabled` is worse than not offering it.
   *
   * Set `GOOGLE_AUTH_ENABLED=true` once the OAuth client is configured.
   */
  get googleAuth() {
    return process.env.GOOGLE_AUTH_ENABLED === "true";
  },
  get googleDocsExport() {
    return Boolean(serverEnv.googleDocsClientId && serverEnv.googleDocsClientSecret);
  },
} as const;

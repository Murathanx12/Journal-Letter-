import type { Metadata } from "next";
import Link from "next/link";

import { GoogleButton } from "@/components/auth/google-button";
import { safeNextPath } from "@/lib/auth/redirect";
import { featureFlags } from "@/lib/env";

import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false, follow: false },
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const target = safeNextPath(next);

  return (
    <div className="space-y-6">
      <div className="space-y-1.5 text-center">
        <h1 className="font-serif text-4xl tracking-[-0.015em] text-ink">Welcome back</h1>
        <p className="text-sm text-ink-muted">Your letters are where you left them.</p>
      </div>

      {featureFlags.googleAuth ? (
        <>
          <GoogleButton next={target} label="Continue with Google" />

          <div className="flex items-center gap-3" role="separator">
            <span className="h-px flex-1 bg-rule" />
            <span className="text-xs text-ink-muted">or</span>
            <span className="h-px flex-1 bg-rule" />
          </div>
        </>
      ) : null}

      <LoginForm next={target} />

      <p className="text-center text-sm text-ink-muted">
        No account yet?{" "}
        <Link
          href={`/signup?next=${encodeURIComponent(target)}`}
          className="text-ink underline underline-offset-4"
        >
          Create one
        </Link>
      </p>
    </div>
  );
}

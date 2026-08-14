import type { Metadata } from "next";
import Link from "next/link";

import { GoogleButton } from "@/components/auth/google-button";
import { safeNextPath } from "@/lib/auth/redirect";

import { SignUpForm } from "./signup-form";

export const metadata: Metadata = {
  title: "Create an account",
  robots: { index: false, follow: false },
};

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const target = safeNextPath(next);

  return (
    <div className="space-y-6">
      <div className="space-y-1.5 text-center">
        <h1 className="font-serif text-2xl text-ink">Start your first book</h1>
        <p className="text-sm text-ink-muted">A journal for yourself, or letters with someone.</p>
      </div>

      <GoogleButton next={target} label="Continue with Google" />

      <div className="flex items-center gap-3" role="separator">
        <span className="h-px flex-1 bg-rule" />
        <span className="text-xs text-ink-muted">or</span>
        <span className="h-px flex-1 bg-rule" />
      </div>

      <SignUpForm next={target} />

      <p className="text-center text-sm text-ink-muted">
        Already have an account?{" "}
        <Link
          href={`/login?next=${encodeURIComponent(target)}`}
          className="text-ink underline underline-offset-4"
        >
          Sign in
        </Link>
      </p>
    </div>
  );
}

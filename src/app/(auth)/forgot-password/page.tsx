import type { Metadata } from "next";
import Link from "next/link";

import { ForgotPasswordForm } from "./forgot-password-form";

export const metadata: Metadata = {
  title: "Reset your password",
  robots: { index: false, follow: false },
};

export default function ForgotPasswordPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-1.5 text-center">
        <h1 className="font-serif text-4xl tracking-[-0.015em] text-ink">Reset your password</h1>
        <p className="text-sm text-ink-muted">
          We will email you a link to choose a new one.
        </p>
      </div>

      <ForgotPasswordForm />

      <p className="text-center text-sm text-ink-muted">
        <Link href="/login" className="text-ink underline underline-offset-4">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}

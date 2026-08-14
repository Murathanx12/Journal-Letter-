import type { Metadata } from "next";

import { ResetPasswordForm } from "./reset-password-form";

export const metadata: Metadata = {
  title: "Choose a new password",
  robots: { index: false, follow: false },
};

/**
 * Reached only from the emailed recovery link, which `/auth/callback` exchanges
 * for a short-lived session before redirecting here. The action re-checks that
 * a session exists, so opening this page directly cannot change anything.
 */
export default function ResetPasswordPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-1.5 text-center">
        <h1 className="font-serif text-4xl tracking-[-0.015em] text-ink">Choose a new password</h1>
        <p className="text-sm text-ink-muted">Then we will take you back to your library.</p>
      </div>

      <ResetPasswordForm />
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/ui/surface";
import { previewInvitation } from "@/lib/invitations/actions";

import { AcceptInvitation } from "./accept-invitation";

export const metadata: Metadata = {
  title: "Invitation",
  robots: { index: false, follow: false },
};

/**
 * Accepting an invitation.
 *
 * The page sits behind the authenticated layout, so an anonymous visitor is
 * redirected to sign in with `?next=` pointing back here and lands on this
 * screen afterwards. `invitation_preview` refuses to answer at all without a
 * session, which is what stops someone brute-forcing tokens to discover that a
 * book exists.
 */
export default async function InvitationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const preview = await previewInvitation(decodeURIComponent(token));

  const problems: Record<string, { title: string; description: string }> = {
    not_found: {
      title: "This invitation could not be found",
      description: "The link may be incomplete. Ask whoever invited you to send a new one.",
    },
    expired: {
      title: "This invitation has expired",
      description: "Invitations last 14 days. Ask for a fresh link.",
    },
    revoked: {
      title: "This invitation was withdrawn",
      description: "The owner of the book cancelled it.",
    },
    accepted: {
      title: "This invitation has already been used",
      description: "Each link works once. If that was not you, ask for a new one.",
    },
    wrong_email: {
      title: "This invitation is for a different account",
      description:
        "It was sent to another email address. Sign in with that account, or ask for an invitation to this one.",
    },
  };

  if (preview.status === "already_member") {
    return (
      <EmptyState
        title={`You are already in ${preview.bookTitle ?? "this book"}`}
        description="Nothing more to do."
        action={
          <Link href="/library" className="text-sm text-ink underline underline-offset-4">
            Go to your library
          </Link>
        }
      />
    );
  }

  const problem = problems[preview.status];
  if (problem) {
    return (
      <EmptyState
        title={problem.title}
        description={problem.description}
        action={
          <Link href="/library" className="text-sm text-ink underline underline-offset-4">
            Go to your library
          </Link>
        }
      />
    );
  }

  return (
    <div className="mx-auto max-w-md space-y-6 py-10 text-center">
      <div className="space-y-2">
        <p className="text-xs tracking-[0.2em] text-ink-muted uppercase">You are invited</p>
        <h1 className="font-serif text-3xl text-balance text-ink">{preview.bookTitle}</h1>
        {preview.bookSubtitle ? (
          <p className="text-sm text-ink-muted">{preview.bookSubtitle}</p>
        ) : null}
      </div>

      <p className="text-sm text-ink-soft">
        {preview.inviterName} invited you to {preview.role === "viewer" ? "read" : "write in"} this
        book. Only the people invited can open it.
      </p>

      <AcceptInvitation token={decodeURIComponent(token)} />
    </div>
  );
}

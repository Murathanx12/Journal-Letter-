import type { Metadata } from "next";
import Link from "next/link";

import { AccountMenu } from "@/components/shell/account-menu";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { requireUser } from "@/lib/auth/session";

/**
 * Nothing behind this layout may ever be indexed. `next.config.ts` also sends
 * an `X-Robots-Tag` header for these paths, so a crawler that ignores metadata
 * still gets told twice.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
};

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // The proxy already redirects anonymous visitors; this is the second gate, and
  // it is the one that gives every page below a guaranteed user object.
  const user = await requireUser();

  return (
    <div className="flex min-h-dvh flex-col bg-paper">
      <header className="sticky top-0 z-30 border-b border-rule bg-paper/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link
            href="/library"
            className="font-serif text-base tracking-tight text-ink whitespace-nowrap"
          >
            Journal <span className="text-ink-muted">&amp;</span> Letter
          </Link>

          <div className="flex items-center gap-1">
            <ThemeToggle />
            <AccountMenu
              displayName={user.profile.display_name}
              email={user.email}
              avatarUrl={user.profile.avatar_url}
            />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 sm:py-10">{children}</main>
    </div>
  );
}

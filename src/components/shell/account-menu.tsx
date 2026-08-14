"use client";

import { LogOut, Settings, User } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { initials } from "@/lib/utils/initials";

export function AccountMenu({
  displayName,
  email,
  avatarUrl,
}: {
  displayName: string;
  email: string | null;
  avatarUrl: string | null;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on outside click and on Escape — the two things people reflexively try.
  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full border border-rule bg-surface text-xs font-medium text-ink-soft transition-colors hover:bg-surface-sunk"
      >
        {avatarUrl ? (
          // Supabase avatar URLs are arbitrary remote hosts; a plain <img> avoids
          // having to allowlist every possible provider domain in next.config.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <span aria-hidden="true">{initials(displayName)}</span>
        )}
        <span className="sr-only">Your account</span>
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-40 mt-2 w-56 overflow-hidden rounded-card border border-rule bg-surface shadow-lg"
        >
          <div className="border-b border-rule px-4 py-3">
            <p className="truncate text-sm font-medium text-ink">{displayName}</p>
            {email ? <p className="truncate text-xs text-ink-muted">{email}</p> : null}
          </div>

          <Link
            href="/library"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-ink-soft hover:bg-surface-sunk"
          >
            <User className="h-4 w-4" aria-hidden="true" />
            Your library
          </Link>

          <Link
            href="/settings/profile"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-ink-soft hover:bg-surface-sunk"
          >
            <Settings className="h-4 w-4" aria-hidden="true" />
            Profile &amp; settings
          </Link>

          {/* A form, not a link: signing out must not be triggerable by a GET. */}
          <form action="/auth/sign-out" method="post" className="border-t border-rule">
            <button
              type="submit"
              role="menuitem"
              className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm text-ink-soft hover:bg-surface-sunk"
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
              Sign out
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}

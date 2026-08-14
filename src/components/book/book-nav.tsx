"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils/cn";

export function BookNav({
  bookId,
  isShared,
  isOwner,
  canWrite,
}: {
  bookId: string;
  isShared: boolean;
  isOwner: boolean;
  canWrite: boolean;
}) {
  const pathname = usePathname();
  const base = `/books/${bookId}`;

  const links = [
    { href: base, label: "Home", exact: true },
    ...(canWrite ? [{ href: `${base}/write`, label: "Write", exact: false }] : []),
    { href: `${base}/read`, label: "Read", exact: false },
    { href: `${base}/calendar`, label: "Calendar", exact: false },
    { href: `${base}/search`, label: "Search", exact: false },
    ...(isShared ? [{ href: `${base}/members`, label: "Members", exact: false }] : []),
    { href: `${base}/export`, label: "Export", exact: false },
    ...(isOwner ? [{ href: `${base}/settings`, label: "Settings", exact: false }] : []),
  ];

  return (
    <nav aria-label="Book sections" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <ul className="flex min-w-max items-center gap-1 border-b border-rule">
        {links.map((link) => {
          const active = link.exact ? pathname === link.href : pathname.startsWith(link.href);
          return (
            <li key={link.href}>
              <Link
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "-mb-px inline-block border-b-2 px-3 py-2.5 text-sm transition-colors",
                  active
                    ? "border-ink text-ink"
                    : "border-transparent text-ink-muted hover:text-ink",
                )}
              >
                {link.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

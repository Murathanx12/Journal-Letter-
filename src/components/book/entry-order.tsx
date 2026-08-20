"use client";

import { ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { reorderEntry } from "@/lib/entries/actions";
import { cn } from "@/lib/utils/cn";

/**
 * Choosing who goes first on a given day.
 *
 * A day in this book is ordered by who wrote first, which is the right default
 * and is occasionally wrong: two people writing the same evening, a letter
 * added the morning after, or a batch of old letters imported in whatever order
 * the export file happened to list them. `within_day_order` has always existed
 * for exactly this, and the ordering is stored rather than derived from
 * timestamps — moving a letter must never require lying about when it was
 * written.
 *
 * Only the author of a letter may move it, which is enforced by RLS rather than
 * by hiding these buttons. Reordering a day that contains somebody else's letter
 * therefore partly succeeds, and the action says so rather than pretending.
 */
export function EntryOrder({
  bookId,
  entryId,
  isFirst,
  isLast,
}: {
  bookId: string;
  entryId: string;
  isFirst: boolean;
  isLast: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function move(direction: "up" | "down") {
    setError(null);
    startTransition(async () => {
      const result = await reorderEntry({ bookId, entryId, direction });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      // The order lives on the server, and the day around this entry has moved
      // too — so re-read the page rather than guessing at the new arrangement.
      router.refresh();
    });
  }

  return (
    <span className="inline-flex items-center gap-0.5">
      {error ? (
        <span role="status" className="mr-1 max-w-56 text-xs text-danger">
          {error}
        </span>
      ) : null}

      {pending ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin text-ink-muted" aria-hidden="true" />
      ) : null}

      <OrderButton
        label="Move this letter earlier in the day"
        disabled={isFirst || pending}
        onClick={() => move("up")}
      >
        <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
      </OrderButton>

      <OrderButton
        label="Move this letter later in the day"
        disabled={isLast || pending}
        onClick={() => move("down")}
      >
        <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
      </OrderButton>
    </span>
  );
}

function OrderButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex h-6 w-6 items-center justify-center rounded-full border border-rule text-ink-muted transition-colors",
        "hover:border-rule-strong hover:text-ink",
        "disabled:opacity-30 disabled:hover:border-rule disabled:hover:text-ink-muted",
      )}
    >
      {children}
    </button>
  );
}

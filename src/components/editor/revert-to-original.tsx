"use client";

import { RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/surface";
import { revertToOriginal } from "@/lib/entries/actions";

/**
 * The promise made on the proofreading screen, kept.
 *
 * As long as `original_content` exists on the row, the author's untouched words
 * are one click away — regardless of how many correction passes have been
 * accepted since.
 */
export function RevertToOriginal({
  bookId,
  entryId,
  correctionState,
}: {
  bookId: string;
  entryId: string;
  correctionState: "original" | "gentle" | "polish";
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (correctionState === "original") {
    return (
      <p className="text-xs text-ink-muted">
        This entry has been corrected in the past and is currently showing your original wording.
      </p>
    );
  }

  return (
    <Card className="flex flex-wrap items-center justify-between gap-3 border-brand/30 bg-brand/5">
      <div>
        <p className="text-sm text-ink-soft">
          Showing the {correctionState === "gentle" ? "gently corrected" : "polished"} version.
        </p>
        {error ? <p className="mt-1 text-xs text-danger">{error}</p> : null}
      </div>

      <Button
        size="sm"
        variant="secondary"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await revertToOriginal(bookId, entryId);
            if (!result.ok) {
              setError(result.error);
              return;
            }
            router.refresh();
          })
        }
      >
        <RotateCcw className="h-4 w-4" aria-hidden="true" />
        {pending ? "Restoring…" : "Restore my original words"}
      </Button>
    </Card>
  );
}

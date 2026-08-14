"use client";

import { Archive, ArchiveRestore, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Field, FormError, Input } from "@/components/ui/form";
import { Card } from "@/components/ui/surface";
import { deleteBook, setBookArchived } from "@/lib/books/actions";

/**
 * Destructive actions.
 *
 * Deleting a book removes years of writing and cannot be undone, so it asks for
 * the title to be typed back — a confirm dialog is too easy to dismiss by
 * reflex. Archiving is offered first because it is almost always what somebody
 * actually wants.
 */
export function DangerZone({
  bookId,
  title,
  isArchived,
  type,
}: {
  bookId: string;
  title: string;
  isArchived: boolean;
  type: "personal_journal" | "shared_letter_book";
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirmTitle, setConfirmTitle] = useState("");
  const [showDelete, setShowDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <section className="space-y-4">
      <h2 className="font-serif text-lg text-ink">Archiving and deleting</h2>

      <Card className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-ink">
              {isArchived ? "This book is archived" : "Archive this book"}
            </p>
            <p className="mt-0.5 text-xs text-ink-muted">
              It stays complete and readable, just tucked away at the bottom of your library.
            </p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await setBookArchived(bookId, !isArchived);
                if (!result.ok) setError(result.error);
                else router.refresh();
              })
            }
          >
            {isArchived ? (
              <>
                <ArchiveRestore className="h-4 w-4" aria-hidden="true" />
                Unarchive
              </>
            ) : (
              <>
                <Archive className="h-4 w-4" aria-hidden="true" />
                Archive
              </>
            )}
          </Button>
        </div>
      </Card>

      <Card className="space-y-4 border-danger/30">
        <div>
          <p className="text-sm font-medium text-danger">Delete this book</p>
          <p className="mt-0.5 text-xs text-ink-muted">
            Every entry, every version, every photograph and{" "}
            {type === "shared_letter_book" ? "everyone's membership" : "all of its settings"} are
            removed permanently. This cannot be undone, and there is no copy kept.
            {type === "shared_letter_book"
              ? " Consider exporting a PDF for everyone first."
              : " Consider exporting a PDF first."}
          </p>
        </div>

        {!showDelete ? (
          <Button variant="danger" size="sm" onClick={() => setShowDelete(true)}>
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            Delete permanently
          </Button>
        ) : (
          <div className="space-y-3">
            <Field
              label={`Type “${title}” to confirm`}
              htmlFor="confirmTitle"
              hint="This is deliberately awkward."
            >
              <Input
                id="confirmTitle"
                value={confirmTitle}
                onChange={(event) => setConfirmTitle(event.target.value)}
                autoComplete="off"
              />
            </Field>

            {error ? <FormError>{error}</FormError> : null}

            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setShowDelete(false);
                  setConfirmTitle("");
                  setError(null);
                }}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                size="sm"
                disabled={pending || confirmTitle.trim() !== title.trim()}
                onClick={() =>
                  startTransition(async () => {
                    const result = await deleteBook(bookId, confirmTitle);
                    // On success the action redirects, so reaching here is a failure.
                    if (result && !result.ok) setError(result.error);
                  })
                }
              >
                {pending ? "Deleting…" : "I understand, delete it"}
              </Button>
            </div>
          </div>
        )}
      </Card>
    </section>
  );
}

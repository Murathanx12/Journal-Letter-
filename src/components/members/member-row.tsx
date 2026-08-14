"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/form";
import { changeMemberRole, removeMember } from "@/lib/invitations/actions";

export function MemberRow({
  bookId,
  userId,
  role,
  name,
}: {
  bookId: string;
  userId: string;
  role: "owner" | "editor" | "viewer";
  name: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex shrink-0 items-center gap-2">
      {error ? <span className="text-xs text-danger">{error}</span> : null}

      <Select
        aria-label={`Role for ${name}`}
        value={role}
        disabled={pending}
        className="w-auto py-1 text-xs"
        onChange={(event) =>
          startTransition(async () => {
            const result = await changeMemberRole({
              bookId,
              userId,
              role: event.target.value as "editor" | "viewer",
            });
            if (!result.ok) setError(result.error);
          })
        }
      >
        <option value="editor">Can write</option>
        <option value="viewer">Can read</option>
      </Select>

      <Button
        size="sm"
        variant="ghost"
        disabled={pending}
        onClick={() => {
          if (!window.confirm(`Remove ${name} from this book? Their entries stay in the book.`)) {
            return;
          }
          startTransition(async () => {
            const result = await removeMember({ bookId, userId });
            if (!result.ok) setError(result.error);
          });
        }}
      >
        Remove
      </Button>
    </div>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { FormError } from "@/components/ui/form";
import { acceptInvitation } from "@/lib/invitations/actions";

export function AcceptInvitation({ token }: { token: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-3">
      {error ? <FormError>{error}</FormError> : null}

      <Button
        size="lg"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await acceptInvitation(token);
            if (!result.ok) {
              setError(result.error);
              return;
            }
            router.push(`/books/${result.data.bookId}`);
            router.refresh();
          })
        }
      >
        {pending ? "Joining…" : "Accept and open the book"}
      </Button>
    </div>
  );
}

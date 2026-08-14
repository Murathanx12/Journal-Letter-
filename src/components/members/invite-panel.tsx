"use client";

import { Check, Copy, Link2 } from "lucide-react";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Field, FormError, Input, Select } from "@/components/ui/form";
import { Card } from "@/components/ui/surface";
import type { PendingInvitation } from "@/lib/books/queries";
import { createInvitation, revokeInvitation } from "@/lib/invitations/actions";

export function InvitePanel({
  bookId,
  invitations,
}: {
  bookId: string;
  invitations: PendingInvitation[];
}) {
  const [pending, startTransition] = useTransition();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"editor" | "viewer">("editor");
  const [error, setError] = useState<string | null>(null);
  const [issued, setIssued] = useState<{ url: string; email: string | null } | null>(null);
  const [copied, setCopied] = useState(false);

  function invite() {
    setError(null);
    setIssued(null);
    startTransition(async () => {
      const result = await createInvitation({ bookId, email, role, expiresInDays: 14 });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setIssued(result.data);
      setEmail("");
    });
  }

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // The field is selectable as a fallback.
    }
  }

  return (
    <section className="space-y-4">
      <h2 className="font-serif text-lg text-ink">Invite someone</h2>

      <Card className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-[1fr_9rem]">
          <Field
            label="Their email"
            htmlFor="inviteEmail"
            hint="Leave blank for a link anyone you send it to can use."
          >
            <Input
              id="inviteEmail"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="them@example.com"
            />
          </Field>

          <Field label="They can" htmlFor="inviteRole">
            <Select
              id="inviteRole"
              value={role}
              onChange={(event) => setRole(event.target.value as "editor" | "viewer")}
            >
              <option value="editor">Write</option>
              <option value="viewer">Read only</option>
            </Select>
          </Field>
        </div>

        {error ? <FormError>{error}</FormError> : null}

        <Button onClick={invite} disabled={pending}>
          <Link2 className="h-4 w-4" aria-hidden="true" />
          {pending ? "Creating…" : "Create invitation"}
        </Button>

        {issued ? (
          <div className="space-y-2 rounded-lg border border-brand/30 bg-brand/5 p-3">
            <p className="text-sm text-ink-soft">
              {issued.email
                ? `Send this to ${issued.email}. Only their account can accept it.`
                : "Anyone with this link can join, so send it carefully."}{" "}
              It expires in 14 days and is shown only once.
            </p>
            <div className="flex gap-2">
              <Input
                readOnly
                value={issued.url}
                onFocus={(event) => event.target.select()}
                className="font-mono text-xs"
              />
              <Button variant="secondary" onClick={() => void copy(issued.url)}>
                {copied ? (
                  <Check className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <Copy className="h-4 w-4" aria-hidden="true" />
                )}
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>
          </div>
        ) : null}
      </Card>

      {invitations.length > 0 ? (
        <Card className="space-y-3">
          <h3 className="text-sm font-medium text-ink-soft">Waiting to be accepted</h3>
          <ul className="divide-y divide-rule">
            {invitations.map((invitation) => (
              <li key={invitation.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm text-ink">
                    {invitation.email ?? "Anyone with the link"}
                  </p>
                  <p className="text-xs text-ink-muted">
                    {invitation.isExpired
                      ? "Expired"
                      : `Expires ${new Date(invitation.expiresAt).toLocaleDateString()}`}
                    {" · "}
                    {invitation.role === "editor" ? "can write" : "read only"}
                  </p>
                </div>

                <Button
                  size="sm"
                  variant="ghost"
                  disabled={pending}
                  onClick={() =>
                    startTransition(async () => {
                      const result = await revokeInvitation({
                        bookId,
                        invitationId: invitation.id,
                      });
                      if (!result.ok) setError(result.error);
                    })
                  }
                >
                  Revoke
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </section>
  );
}

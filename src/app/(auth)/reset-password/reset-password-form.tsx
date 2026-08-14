"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Field, FormError, Input } from "@/components/ui/form";
import { updatePassword } from "@/lib/auth/actions";
import type { ActionResult } from "@/lib/actions/result";

export function ResetPasswordForm() {
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(
    updatePassword,
    null,
  );

  return (
    <form action={formAction} className="space-y-4" noValidate>
      <Field label="New password" htmlFor="password" hint="At least 8 characters.">
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
        />
      </Field>

      {state && !state.ok ? <FormError>{state.error}</FormError> : null}

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Saving…" : "Save password"}
      </Button>
    </form>
  );
}

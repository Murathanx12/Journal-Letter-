"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Field, FormError, FormSuccess, Input } from "@/components/ui/form";
import { requestPasswordReset } from "@/lib/auth/actions";
import type { ActionResult } from "@/lib/actions/result";

export function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(
    requestPasswordReset,
    null,
  );

  if (state?.ok) {
    return (
      // Worded so it reads the same whether or not that address has an account.
      <FormSuccess>
        If that address has an account, a reset link is on its way.
      </FormSuccess>
    );
  }

  return (
    <form action={formAction} className="space-y-4" noValidate>
      <Field label="Email" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </Field>

      {state && !state.ok ? <FormError>{state.error}</FormError> : null}

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Sending…" : "Send reset link"}
      </Button>
    </form>
  );
}

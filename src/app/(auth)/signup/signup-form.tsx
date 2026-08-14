"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Field, FormError, FormSuccess, Input } from "@/components/ui/form";
import { signUpWithPassword } from "@/lib/auth/actions";
import type { ActionResult } from "@/lib/actions/result";

type State = ActionResult<{ needsVerification: boolean }> | null;

export function SignUpForm({ next }: { next: string }) {
  const [state, formAction, pending] = useActionState<State, FormData>(signUpWithPassword, null);

  // When email confirmation is enabled there is no session yet, so telling
  // people to go and check their inbox is the whole of the next step.
  if (state?.ok && state.data.needsVerification) {
    return (
      <FormSuccess>
        Check your email for a link to confirm your address. You can close this tab.
      </FormSuccess>
    );
  }

  return (
    <form action={formAction} className="space-y-4" noValidate>
      <input type="hidden" name="next" value={next} />

      <Field
        label="What should we call you?"
        htmlFor="displayName"
        hint="This is the name that appears above your letters."
      >
        <Input id="displayName" name="displayName" autoComplete="name" required maxLength={80} />
      </Field>

      <Field label="Email" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </Field>

      <Field label="Password" htmlFor="password" hint="At least 8 characters.">
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
        {pending ? "Creating your account…" : "Create account"}
      </Button>
    </form>
  );
}

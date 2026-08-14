"use client";

import Link from "next/link";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Field, FormError, Input } from "@/components/ui/form";
import { signInWithPassword } from "@/lib/auth/actions";
import type { ActionResult } from "@/lib/actions/result";

export function LoginForm({ next }: { next: string }) {
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(
    signInWithPassword,
    null,
  );

  return (
    <form action={formAction} className="space-y-4" noValidate>
      <input type="hidden" name="next" value={next} />

      <Field label="Email" htmlFor="email">
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="you@example.com"
        />
      </Field>

      <Field label="Password" htmlFor="password">
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </Field>

      {state && !state.ok ? <FormError>{state.error}</FormError> : null}

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </Button>

      <p className="text-center text-sm">
        <Link href="/forgot-password" className="text-ink-muted underline underline-offset-4 hover:text-ink">
          Forgotten your password?
        </Link>
      </p>
    </form>
  );
}

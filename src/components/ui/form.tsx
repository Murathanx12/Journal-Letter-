import type { ComponentProps, ReactNode } from "react";

import { cn } from "@/lib/utils/cn";

// `rule-strong` rather than `rule`: a form control needs a visible edge to read
// as something you can type into, especially against the dark surface.
const controlClasses =
  "w-full rounded-lg border border-rule-strong bg-surface px-3 py-2.5 text-sm text-ink placeholder:text-ink-muted transition-colors hover:border-ink-muted focus:border-brand disabled:opacity-60";

/**
 * A labelled control with room for a hint and an error.
 *
 * The label is a real `<label>` bound by `htmlFor`, and the error is wired up
 * through `aria-describedby` on the control itself, so a screen reader announces
 * why a field was rejected rather than just that it was.
 */
export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
  className,
}: {
  label: string;
  htmlFor: string;
  hint?: ReactNode;
  error?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={htmlFor} className="block text-sm font-medium text-ink-soft">
        {label}
      </label>
      {children}
      {hint && !error ? (
        <p id={`${htmlFor}-hint`} className="text-xs text-ink-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${htmlFor}-error`} className="text-xs text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(controlClasses, className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cn(controlClasses, "resize-y", className)} {...props} />;
}

export function Select({ className, children, ...props }: ComponentProps<"select">) {
  return (
    <select className={cn(controlClasses, "pr-8", className)} {...props}>
      {children}
    </select>
  );
}

export function Checkbox({ label, className, id, ...props }: ComponentProps<"input"> & { label: string }) {
  return (
    <label htmlFor={id} className={cn("flex items-center gap-2.5 text-sm text-ink-soft", className)}>
      <input
        id={id}
        type="checkbox"
        className="h-4 w-4 rounded border-rule-strong text-ink accent-[var(--color-brand)]"
        {...props}
      />
      {label}
    </label>
  );
}

/** A form-level message, distinct from per-field errors. */
export function FormError({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <p
      role="alert"
      className="rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger"
    >
      {children}
    </p>
  );
}

export function FormSuccess({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <p
      role="status"
      className="rounded-lg border border-success/30 bg-success/5 px-3 py-2 text-sm text-success"
    >
      {children}
    </p>
  );
}

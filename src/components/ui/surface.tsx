import type { ComponentProps, ReactNode } from "react";

import { cn } from "@/lib/utils/cn";

export function Card({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn("rounded-card border border-rule bg-surface p-5 shadow-sm", className)}
      {...props}
    />
  );
}

export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-end justify-between gap-4", className)}>
      <div className="space-y-1.5">
        {/* Instrument Serif is a display face — it needs size and slightly
            tightened tracking to look deliberate rather than spindly. */}
        <h1 className="font-serif text-3xl leading-[1.1] tracking-[-0.015em] text-ink sm:text-4xl">
          {title}
        </h1>
        {description ? <p className="text-sm text-ink-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

/**
 * Empty states matter more than usual here — a brand-new journal is empty by
 * definition, and that first screen should feel like an invitation rather than
 * a bug.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-card border border-dashed border-rule-strong px-6 py-16 text-center">
      {icon ? <div className="mb-4 text-ink-muted">{icon}</div> : null}
      <h2 className="font-serif text-lg text-ink">{title}</h2>
      {description ? (
        <p className="mt-2 max-w-md text-sm text-ink-muted">{description}</p>
      ) : null}
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}

export function Badge({ className, ...props }: ComponentProps<"span">) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border border-rule px-2 py-0.5 text-xs text-ink-muted",
        className,
      )}
      {...props}
    />
  );
}

export function Divider({ className }: { className?: string }) {
  return <hr className={cn("border-0 border-t border-rule", className)} />;
}

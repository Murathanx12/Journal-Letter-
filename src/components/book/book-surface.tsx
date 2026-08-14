import type { CSSProperties, ReactNode } from "react";

import type { BookMember } from "@/lib/books/queries";
import { designToCssVars, getFont, type ResolvedDesign } from "@/lib/design/theme";
import { cn } from "@/lib/utils/cn";

/**
 * The surface every book page renders onto.
 *
 * All typography arrives as CSS custom properties rather than class names, so a
 * book's design is data the reader can change, not a branch in the markup. Each
 * contributor's chosen typeface is published as `--author-font-<id>`, which lets
 * an entry pick up its writer's font with one variable reference and no
 * per-entry style objects.
 */
export function BookSurface({
  design,
  members,
  children,
  className,
}: {
  design: ResolvedDesign;
  members: BookMember[];
  children: ReactNode;
  className?: string;
}) {
  const authorFontVars: Record<string, string> = {};
  if (design.perAuthorFonts) {
    for (const member of members) {
      authorFontVars[`--author-font-${member.userId}`] = getFont(member.preferredFont).stack;
    }
  }

  const style = { ...designToCssVars(design), ...authorFontVars } as CSSProperties;

  return (
    <div className={cn(className)} style={style}>
      {children}
    </div>
  );
}

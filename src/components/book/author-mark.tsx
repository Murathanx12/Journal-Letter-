import type { BookMember } from "@/lib/books/queries";
import { getAccent, getFont } from "@/lib/design/theme";
import { cn } from "@/lib/utils/cn";

/**
 * Who wrote this.
 *
 * The name is always spelled out — the accent colour and the typeface are
 * reinforcement, never the only signal. Somebody reading in greyscale, or with
 * a colour vision deficiency, or listening to a screen reader, still knows
 * exactly whose letter this is.
 */
export function AuthorMark({
  author,
  showSignature = true,
  perAuthorFonts = true,
  className,
}: {
  author: Pick<BookMember, "displayName" | "signature" | "accent" | "preferredFont">;
  showSignature?: boolean;
  perAuthorFonts?: boolean;
  className?: string;
}) {
  const accent = getAccent(author.accent);
  const font = getFont(author.preferredFont);

  return (
    <div className={cn("flex items-baseline gap-2.5", className)}>
      {/* A short rule in the writer's accent, purely decorative. */}
      <span
        aria-hidden="true"
        className="inline-block h-px w-6 shrink-0 translate-y-[-0.25em]"
        style={{ backgroundColor: `light-dark(${accent.light}, ${accent.dark})` }}
      />
      <span
        className="text-sm tracking-wide"
        style={{
          color: `light-dark(${accent.light}, ${accent.dark})`,
          fontFamily: perAuthorFonts ? font.stack : undefined,
        }}
      >
        {author.displayName}
      </span>
      {showSignature && author.signature ? (
        <span className="font-[family-name:var(--font-caveat)] text-base text-ink-muted">
          {author.signature}
        </span>
      ) : null}
    </div>
  );
}

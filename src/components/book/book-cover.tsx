import { getCoverPreset, getFont, type BookCover, type PresetId } from "@/lib/design/theme";
import { PRESETS } from "@/lib/design/theme";
import { cn } from "@/lib/utils/cn";

/**
 * A book cover, drawn rather than photographed.
 *
 * Deliberately restrained: a frame, a title, an optional subtitle and the
 * contributors' names. It should read as a hardback on a shelf, not as a
 * product card — which is why there is no badge, no shadow stack and no hover
 * lift beyond a small one.
 */
export function BookCover({
  title,
  subtitle,
  contributors,
  cover,
  designPreset,
  imageUrl,
  className,
  size = "md",
}: {
  title: string;
  subtitle?: string | null;
  contributors?: string[];
  cover: BookCover;
  designPreset?: PresetId;
  /** Signed URL for an uploaded cover image, when there is one. */
  imageUrl?: string | null;
  className?: string;
  size?: "sm" | "md" | "lg";
}) {
  const preset = getCoverPreset(cover.preset);
  const headingFont = getFont(designPreset ? PRESETS[designPreset].headingFont : undefined);

  const scale = {
    sm: { title: "text-sm", subtitle: "text-[10px]", pad: "p-4", frame: "inset-2" },
    md: { title: "text-lg", subtitle: "text-xs", pad: "p-6", frame: "inset-3" },
    lg: { title: "text-2xl", subtitle: "text-sm", pad: "p-8", frame: "inset-4" },
  }[size];

  return (
    <div
      className={cn(
        "relative flex aspect-[3/4] flex-col justify-between overflow-hidden rounded-md",
        scale.pad,
        className,
      )}
      style={{
        background: imageUrl ? undefined : preset.background,
        color: preset.foreground,
      }}
    >
      {imageUrl ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
          {/* Scrim, so the title stays legible over any photograph. */}
          <div className="absolute inset-0 bg-black/45" aria-hidden="true" />
        </>
      ) : null}

      {/* The hairline frame that makes it read as a bound cover. */}
      <div
        className={cn("pointer-events-none absolute rounded-sm border", scale.frame)}
        style={{ borderColor: imageUrl ? "rgba(255,255,255,0.5)" : preset.rule }}
        aria-hidden="true"
      />

      <div className="relative" />

      <div className="relative text-center">
        <h3
          className={cn("leading-tight text-balance", scale.title)}
          style={{
            fontFamily: headingFont.stack,
            color: imageUrl ? "#fff" : preset.foreground,
          }}
        >
          {title}
        </h3>
        {subtitle ? (
          <p
            className={cn("mt-1.5 opacity-80", scale.subtitle)}
            style={{ color: imageUrl ? "#fff" : preset.foreground }}
          >
            {subtitle}
          </p>
        ) : null}
      </div>

      <div className="relative text-center">
        {contributors && contributors.length > 0 ? (
          <p
            className={cn("tracking-[0.15em] uppercase opacity-70", scale.subtitle)}
            style={{ color: imageUrl ? "#fff" : preset.foreground }}
          >
            {contributors.join(" · ")}
          </p>
        ) : null}
      </div>
    </div>
  );
}

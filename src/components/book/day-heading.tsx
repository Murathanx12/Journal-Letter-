import { formatLongDate, formatWeekday, type CalendarDate } from "@/lib/date/calendar-date";
import type { TypographyPreset } from "@/lib/design/theme";
import { cn } from "@/lib/utils/cn";

/**
 * A date acting as a chapter heading.
 *
 * The four styles are what make a "Classic Novel" book feel different from an
 * "Academic Journal" one without changing a single word of the writing.
 */
export function DayHeading({
  date,
  preset,
  milestone,
  className,
}: {
  date: CalendarDate;
  preset: TypographyPreset;
  /** An anniversary or birthday falling on this day, shown alongside. */
  milestone?: string | null;
  className?: string;
}) {
  const label = formatLongDate(date);
  const weekday = formatWeekday(date);

  const style = preset.dateStyle;

  return (
    <div
      className={cn(
        "scroll-mt-24",
        style === "centered" && "text-center",
        style === "underlined" && "border-b border-rule pb-2",
        className,
      )}
      id={`day-${date}`}
    >
      <h2
        className={cn(
          "text-ink-muted",
          style === "smallcaps" && "text-xs tracking-[0.25em] uppercase",
          style === "centered" && "text-sm tracking-[0.22em] uppercase",
          style === "plain" && "text-sm font-medium",
          style === "underlined" && "text-sm font-medium",
        )}
        style={{ fontFamily: "var(--book-heading-font)" }}
      >
        {/* The machine-readable date sits alongside the human one. */}
        <time dateTime={date}>{label}</time>
        {style === "plain" || style === "underlined" ? (
          <span className="ml-2 font-normal text-ink-muted/70">{weekday}</span>
        ) : null}
      </h2>

      {milestone ? (
        <p className="mt-1.5 text-xs tracking-wide text-brand italic">{milestone}</p>
      ) : null}
    </div>
  );
}

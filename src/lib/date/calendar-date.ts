/**
 * Calendar dates, handled carefully.
 *
 * An entry's date is a *calendar* date — "14 August 2026" — not an instant. The
 * two are constantly confused and the bug is always the same: someone writes
 * `new Date("2026-08-14")`, which parses as UTC midnight, then formats it in a
 * timezone behind UTC, and the letter silently moves to the 13th.
 *
 * So: calendar dates are `YYYY-MM-DD` strings everywhere in this codebase, and
 * every conversion to a `Date` here pins the timezone to UTC explicitly. The
 * only place a real timezone matters is deciding what "today" means, which
 * depends on the *book's* timezone rather than the reader's — two people in
 * Hong Kong and London must agree on which day they are writing.
 */

export type CalendarDate = string; // YYYY-MM-DD

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isCalendarDate(value: string): value is CalendarDate {
  if (!ISO_DATE.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number) as [number, number, number];
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  // Reject impossible days such as 2026-02-31.
  const probe = new Date(Date.UTC(y, m - 1, d));
  return probe.getUTCFullYear() === y && probe.getUTCMonth() === m - 1 && probe.getUTCDate() === d;
}

/** Today, as seen from a given IANA timezone. */
export function todayIn(timeZone: string): CalendarDate {
  try {
    // en-CA formats as YYYY-MM-DD, which is exactly the shape we store.
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  } catch {
    // An invalid timezone should never lose someone's writing — fall back to UTC.
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  }
}

/** A UTC-pinned Date, safe to hand to Intl for formatting. */
export function toUtcDate(value: CalendarDate): Date {
  const [y, m, d] = value.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d));
}

export function fromUtcDate(date: Date): CalendarDate {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function addDays(value: CalendarDate, days: number): CalendarDate {
  const date = toUtcDate(value);
  date.setUTCDate(date.getUTCDate() + days);
  return fromUtcDate(date);
}

export function startOfMonth(value: CalendarDate): CalendarDate {
  return `${value.slice(0, 7)}-01`;
}

export function endOfMonth(value: CalendarDate): CalendarDate {
  const [y, m] = value.split("-").map(Number) as [number, number];
  return fromUtcDate(new Date(Date.UTC(y, m, 0)));
}

export function addMonths(value: CalendarDate, months: number): CalendarDate {
  const [y, m, d] = value.split("-").map(Number) as [number, number, number];
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  // Clamp: 31 January + 1 month is the last day of February, not 3 March.
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return fromUtcDate(target);
}

export function compareCalendarDates(a: CalendarDate, b: CalendarDate): number {
  // Lexicographic comparison is correct for zero-padded ISO dates.
  return a < b ? -1 : a > b ? 1 : 0;
}

/** "14 August 2026" — used as the chapter heading in the reading view. */
export function formatLongDate(value: CalendarDate, locale = "en-GB"): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone: "UTC",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(toUtcDate(value));
}

/** "Friday" */
export function formatWeekday(value: CalendarDate, locale = "en-GB"): string {
  return new Intl.DateTimeFormat(locale, { timeZone: "UTC", weekday: "long" }).format(
    toUtcDate(value),
  );
}

/** "14 Aug 2026" — compact, for cards and lists. */
export function formatShortDate(value: CalendarDate, locale = "en-GB"): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(toUtcDate(value));
}

export function formatMonthYear(value: CalendarDate, locale = "en-GB"): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone: "UTC",
    month: "long",
    year: "numeric",
  }).format(toUtcDate(value));
}

/** Which weekday a date falls on, 0 = Monday, for building calendar grids. */
export function weekdayIndexMondayFirst(value: CalendarDate): number {
  return (toUtcDate(value).getUTCDay() + 6) % 7;
}

export function daysInMonth(value: CalendarDate): number {
  const [y, m] = value.split("-").map(Number) as [number, number];
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/**
 * Whole years between two calendar dates that share a month and day.
 * Powers "One year ago today".
 */
export function yearsBetween(from: CalendarDate, to: CalendarDate): number {
  return Number(to.slice(0, 4)) - Number(from.slice(0, 4));
}

export function sameMonthAndDay(a: CalendarDate, b: CalendarDate): boolean {
  return a.slice(5) === b.slice(5);
}

/**
 * A curated timezone list for the book-settings picker. `Intl.supportedValuesOf`
 * returns 400+ zones, which is a miserable dropdown; this covers the common
 * cases and the UI falls back to the full list on request.
 */
export const COMMON_TIMEZONES = [
  "UTC",
  "Europe/London",
  "Europe/Dublin",
  "Europe/Lisbon",
  "Europe/Madrid",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Amsterdam",
  "Europe/Rome",
  "Europe/Stockholm",
  "Europe/Warsaw",
  "Europe/Istanbul",
  "Europe/Moscow",
  "Africa/Cairo",
  "Africa/Lagos",
  "Africa/Johannesburg",
  "Asia/Dubai",
  "Asia/Karachi",
  "Asia/Kolkata",
  "Asia/Dhaka",
  "Asia/Bangkok",
  "Asia/Jakarta",
  "Asia/Singapore",
  "Asia/Hong_Kong",
  "Asia/Shanghai",
  "Asia/Taipei",
  "Asia/Seoul",
  "Asia/Tokyo",
  "Australia/Perth",
  "Australia/Adelaide",
  "Australia/Sydney",
  "Pacific/Auckland",
  "America/Sao_Paulo",
  "America/Argentina/Buenos_Aires",
  "America/New_York",
  "America/Toronto",
  "America/Chicago",
  "America/Mexico_City",
  "America/Denver",
  "America/Los_Angeles",
  "America/Vancouver",
  "America/Anchorage",
  "Pacific/Honolulu",
] as const;

/** Best-effort guess of the visitor's timezone, used to prefill New Book. */
export function guessTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

export function isValidTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  addDays,
  addMonths,
  compareCalendarDates,
  daysInMonth,
  endOfMonth,
  formatLongDate,
  formatShortDate,
  isCalendarDate,
  isValidTimezone,
  sameMonthAndDay,
  startOfMonth,
  todayIn,
  toUtcDate,
  weekdayIndexMondayFirst,
  yearsBetween,
} from "@/lib/date/calendar-date";

/**
 * Dates are the easiest thing in this product to get quietly wrong, and the
 * damage — a letter filed under the wrong day, forever — is not obvious until
 * much later. These tests pin down the timezone behaviour specifically.
 */

afterEach(() => {
  vi.useRealTimers();
});

describe("todayIn", () => {
  it("gives different calendar days to Hong Kong and London at the same instant", () => {
    // 23:30 UTC: already tomorrow in Hong Kong, still today in London.
    vi.setSystemTime(new Date("2026-08-14T23:30:00.000Z"));

    expect(todayIn("Asia/Hong_Kong")).toBe("2026-08-15");
    expect(todayIn("Europe/London")).toBe("2026-08-15"); // BST is UTC+1
    expect(todayIn("UTC")).toBe("2026-08-14");
    expect(todayIn("America/Los_Angeles")).toBe("2026-08-14");
  });

  it("does not roll the day over early for a timezone behind UTC", () => {
    vi.setSystemTime(new Date("2026-08-14T02:00:00.000Z"));

    expect(todayIn("UTC")).toBe("2026-08-14");
    expect(todayIn("America/New_York")).toBe("2026-08-13");
    expect(todayIn("Asia/Hong_Kong")).toBe("2026-08-14");
  });

  it("falls back to UTC rather than throwing on a nonsense timezone", () => {
    vi.setSystemTime(new Date("2026-08-14T12:00:00.000Z"));
    expect(todayIn("Not/AZone")).toBe("2026-08-14");
  });
});

describe("formatting", () => {
  it("never shifts the day when formatting, whatever the machine's timezone", () => {
    // The classic bug: new Date("2026-08-14") is UTC midnight, and formatting it
    // in a timezone behind UTC prints the 13th.
    expect(formatLongDate("2026-08-14")).toBe("14 August 2026");
    expect(formatShortDate("2026-08-14")).toBe("14 Aug 2026");
    expect(formatLongDate("2026-01-01")).toBe("1 January 2026");
    expect(formatLongDate("2026-12-31")).toBe("31 December 2026");
  });

  it("pins the parsed date to UTC", () => {
    expect(toUtcDate("2026-08-14").toISOString()).toBe("2026-08-14T00:00:00.000Z");
  });
});

describe("isCalendarDate", () => {
  it("accepts well-formed dates", () => {
    expect(isCalendarDate("2026-08-14")).toBe(true);
    expect(isCalendarDate("2024-02-29")).toBe(true); // a real leap day
  });

  it("rejects malformed or impossible dates", () => {
    expect(isCalendarDate("2026-8-14")).toBe(false);
    expect(isCalendarDate("14/08/2026")).toBe(false);
    expect(isCalendarDate("2026-02-31")).toBe(false);
    expect(isCalendarDate("2025-02-29")).toBe(false); // not a leap year
    expect(isCalendarDate("2026-13-01")).toBe(false);
    expect(isCalendarDate("")).toBe(false);
    expect(isCalendarDate("2026-08-14T00:00:00Z")).toBe(false);
  });
});

describe("arithmetic", () => {
  it("adds days across a month boundary", () => {
    expect(addDays("2026-08-31", 1)).toBe("2026-09-01");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
  });

  it("clamps when adding months to the end of a long month", () => {
    // 31 January + 1 month is the last day of February, not 3 March.
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2024-01-31", 1)).toBe("2024-02-29");
    expect(addMonths("2026-03-15", -1)).toBe("2026-02-15");
  });

  it("finds month boundaries", () => {
    expect(startOfMonth("2026-08-14")).toBe("2026-08-01");
    expect(endOfMonth("2026-08-14")).toBe("2026-08-31");
    expect(endOfMonth("2026-02-10")).toBe("2026-02-28");
    expect(endOfMonth("2024-02-10")).toBe("2024-02-29");
  });

  it("counts days in a month", () => {
    expect(daysInMonth("2026-02-01")).toBe(28);
    expect(daysInMonth("2024-02-01")).toBe(29);
    expect(daysInMonth("2026-08-01")).toBe(31);
  });

  it("orders dates lexicographically, which is correct for ISO dates", () => {
    expect(compareCalendarDates("2026-08-14", "2026-08-15")).toBe(-1);
    expect(compareCalendarDates("2026-08-15", "2026-08-14")).toBe(1);
    expect(compareCalendarDates("2026-08-14", "2026-08-14")).toBe(0);
  });
});

describe("calendar grid", () => {
  it("indexes weekdays from Monday", () => {
    // 2026-08-14 is a Friday.
    expect(weekdayIndexMondayFirst("2026-08-14")).toBe(4);
    // 2026-08-16 is a Sunday, the last column.
    expect(weekdayIndexMondayFirst("2026-08-16")).toBe(6);
    // 2026-08-17 is a Monday, the first.
    expect(weekdayIndexMondayFirst("2026-08-17")).toBe(0);
  });
});

describe("on this day", () => {
  it("recognises the same calendar day in another year", () => {
    expect(sameMonthAndDay("2025-08-14", "2026-08-14")).toBe(true);
    expect(sameMonthAndDay("2025-08-13", "2026-08-14")).toBe(false);
    expect(yearsBetween("2025-08-14", "2026-08-14")).toBe(1);
    expect(yearsBetween("2020-08-14", "2026-08-14")).toBe(6);
  });
});

describe("isValidTimezone", () => {
  it("accepts IANA zones and rejects nonsense", () => {
    expect(isValidTimezone("Asia/Hong_Kong")).toBe(true);
    expect(isValidTimezone("UTC")).toBe(true);
    expect(isValidTimezone("Nowhere/Nothing")).toBe(false);
  });
});

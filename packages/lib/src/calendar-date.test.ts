import { describe, expect, test } from "bun:test";
import {
  compareCalendarDates,
  formatCalendarDateForDisplay,
  fromCalendarDateString,
  toCalendarDateString,
  wallClockToInstant,
} from "./calendar-date";

describe("compareCalendarDates", () => {
  test("2026-03-01 sorts after 2026-02-28, via string comparison only", () => {
    // No `Date` object is constructed anywhere in this test -- the strings
    // are compared directly, which is the whole point: zero-padded ISO
    // dates compare correctly lexicographically, no Date math needed.
    expect(compareCalendarDates("2026-03-01", "2026-02-28")).toBeGreaterThan(0);
  });

  test("is symmetric and reports equality", () => {
    expect(compareCalendarDates("2026-02-28", "2026-03-01")).toBeLessThan(0);
    expect(compareCalendarDates("2026-03-01", "2026-03-01")).toBe(0);
  });

  test("sorts a mixed list into calendar order", () => {
    const dates = ["2026-12-31", "2026-01-01", "2026-03-01", "2026-02-28"];
    expect([...dates].sort(compareCalendarDates)).toEqual([
      "2026-01-01",
      "2026-02-28",
      "2026-03-01",
      "2026-12-31",
    ]);
  });
});

describe("fromCalendarDateString", () => {
  test("parses parts without constructing a Date", () => {
    expect(fromCalendarDateString("2026-03-01")).toEqual({ year: 2026, month: 3, day: 1 });
  });

  test("rejects a malformed string", () => {
    expect(() => fromCalendarDateString("2026/03/01")).toThrow();
  });
});

describe("toCalendarDateString", () => {
  test("round-trips through fromCalendarDateString using local fields", () => {
    const d = new Date(2026, 2, 1, 15, 30); // local: Mar 1 2026, 15:30
    expect(toCalendarDateString(d)).toBe("2026-03-01");
    expect(fromCalendarDateString(toCalendarDateString(d))).toEqual({
      year: 2026,
      month: 3,
      day: 1,
    });
  });
});

describe("wallClockToInstant", () => {
  test("09:00 in Asia/Ho_Chi_Minh (UTC+7) differs from 09:00 UTC", () => {
    const ict = wallClockToInstant("2026-03-01", "09:00", "Asia/Ho_Chi_Minh");
    const utc = wallClockToInstant("2026-03-01", "09:00", "UTC");

    // The two calls must NOT produce the same instant.
    expect(ict.getTime()).not.toBe(utc.getTime());

    // Vietnam is UTC+7 with no DST, so 09:00 ICT is 02:00 UTC the same day.
    expect(ict.getUTCHours()).toBe(2);
    expect(ict.getUTCDate()).toBe(1);
    expect(ict.getUTCMonth()).toBe(2); // 0-indexed: March

    // 09:00 UTC is, unsurprisingly, 09:00 UTC.
    expect(utc.getUTCHours()).toBe(9);

    // The naive `new Date(`${date}T${hhmm}:00`)` approach reads hhmm in the
    // SYSTEM's local timezone, so both calls above would come out identical
    // whenever the machine happens to be UTC, or wrong-by-a-fixed-offset
    // (and still identical to each other) whenever it isn't -- either way
    // failing to reproduce the real 7-hour Vietnam/UTC gap asserted here.
    const diffHours = (utc.getTime() - ict.getTime()) / (1000 * 60 * 60);
    expect(diffHours).toBe(7);
  });
});

describe("formatCalendarDateForDisplay", () => {
  test("renders a calendar-date string as a human-readable date", () => {
    expect(formatCalendarDateForDisplay("2026-03-01")).toBe("Mar 1, 2026");
  });
});

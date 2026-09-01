/**
 * Calendar dates vs. instants
 * ---------------------------
 * A CALENDAR DATE (a due date, a birthday, "the invoice is due on 2026-03-01")
 * is a different KIND OF THING than an INSTANT (a precise moment on the UTC
 * timeline, like "this row was created at 2026-03-01T02:00:00Z").
 *
 * Calendar dates are stored and compared here as plain `YYYY-MM-DD` strings,
 * never via `new Date('2026-03-01')` + local-timezone-aware `Date` methods.
 * `new Date('2026-03-01')` parses as UTC midnight; calling `.getDate()` /
 * `.getMonth()` / `.getFullYear()` on that value reads it back through the
 * MACHINE's local timezone, which silently shifts the date by one day
 * whenever the machine sits west of UTC (e.g. `America/New_York`) at a time
 * near midnight. That is exactly the bug class this module exists to avoid.
 *
 * Convention chosen here (be deliberate, and consistent):
 *   - `toCalendarDateString` reads the LOCAL calendar fields off a `Date`
 *     object (year/month/day as the machine's local clock would show them).
 *     This is deliberate: when you ask "what calendar date is `date`?", you
 *     almost always mean "what date is it on a wall clock", not "what date
 *     is it in UTC". Use this to derive a calendar-date string from a
 *     concrete instant (e.g. "what day did this event happen, locally").
 *   - `fromCalendarDateString` never constructs a `Date` at all -- it parses
 *     the string into plain numeric parts. A calendar date is not tied to
 *     any timezone, so there's nothing to convert.
 *   - `compareCalendarDates` never touches `Date` either -- zero-padded
 *     ISO (`YYYY-MM-DD`) strings sort correctly under plain lexicographic
 *     string comparison, so that's all it does.
 *   - `wallClockToInstant` is the ONLY place a timezone-aware conversion to
 *     a real instant happens, and it takes the IANA zone explicitly as a
 *     parameter -- it never relies on the machine's local timezone.
 */

export interface CalendarDateParts {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
}

const CALENDAR_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Converts a `Date` object to a `YYYY-MM-DD` string using the date's LOCAL
 * calendar fields (year/month/day as the machine's local clock would read
 * them) -- deliberately NOT UTC. See module doc comment for rationale.
 */
export function toCalendarDateString(date: Date): string {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * Parses a `YYYY-MM-DD` string into its numeric parts, WITHOUT constructing
 * a `Date` object internally. Pure string/number parsing: a calendar date
 * has no timezone to get wrong.
 */
export function fromCalendarDateString(s: string): CalendarDateParts {
  const match = CALENDAR_DATE_RE.exec(s);
  if (!match) {
    throw new Error(`Invalid calendar date string: ${s} (expected YYYY-MM-DD)`);
  }
  const [, yearStr, monthStr, dayStr] = match;
  return {
    year: Number(yearStr),
    month: Number(monthStr),
    day: Number(dayStr),
  };
}

/**
 * Compares two `YYYY-MM-DD` calendar-date strings via plain STRING
 * comparison. Zero-padded ISO dates sort correctly lexicographically, so no
 * `Date` math is needed (or wanted). Returns negative/zero/positive, like
 * `Array.prototype.sort`'s comparator convention.
 */
export function compareCalendarDates(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/**
 * Combines a calendar date (`YYYY-MM-DD`) and a wall-clock time (`HH:mm`)
 * IN A SPECIFIC IANA time zone into a real `Date` instant (UTC-backed).
 *
 * This does real timezone-aware conversion: it does NOT do the naive
 * `new Date(`${date}T${hhmm}:00`)`, which is interpreted in the SYSTEM's
 * local timezone rather than the `timeZone` parameter -- exactly the bug
 * this function exists to prevent.
 *
 * Approach: format a UTC "guess" instant back through `Intl.DateTimeFormat`
 * in the target zone to discover that zone's UTC offset at (approximately)
 * this date, then correct the guess by that offset.
 */
export function wallClockToInstant(date: string, hhmm: string, timeZone: string): Date {
  const { year, month, day } = fromCalendarDateString(date);
  const timeMatch = /^(\d{2}):(\d{2})$/.exec(hhmm);
  if (!timeMatch) {
    throw new Error(`Invalid wall-clock time: ${hhmm} (expected HH:mm)`);
  }
  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);

  // Step 1: treat the requested wall-clock fields as if they were UTC. This
  // is only a starting guess for the real instant.
  const utcGuessMs = Date.UTC(year, month - 1, day, hour, minute, 0);

  // Step 2: ask what wall-clock time that guessed instant reads as in the
  // TARGET zone, using Intl's timezone-aware formatting (no external lib).
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = dtf.formatToParts(new Date(utcGuessMs));
  const get = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((p) => p.type === type)?.value ?? "0");

  const asZonedMs = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour") === 24 ? 0 : get("hour"),
    get("minute"),
    get("second"),
  );

  // Step 3: the difference tells us the target zone's offset from UTC at
  // (approximately) this instant. Subtract it from the guess to land on
  // the actual UTC instant that reads as the requested wall-clock time in
  // that zone.
  const offsetMs = asZonedMs - utcGuessMs;
  return new Date(utcGuessMs - offsetMs);
}

/**
 * Renders a `YYYY-MM-DD` calendar-date string as a human-readable date
 * (e.g. "Mar 1, 2026") without ever parsing the string through a naive
 * `new Date(s)` call, which could shift the date by a day depending on the
 * runtime's local timezone. Parts are parsed manually and a UTC-anchored
 * `Date` is constructed deliberately, then formatted with `timeZone: "UTC"`
 * so the display path can never disagree with the parts we fed it.
 */
export function formatCalendarDateForDisplay(s: string, locale = "en-US"): string {
  const { year, month, day } = fromCalendarDateString(s);
  const anchored = new Date(Date.UTC(year, month - 1, day));
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(anchored);
}

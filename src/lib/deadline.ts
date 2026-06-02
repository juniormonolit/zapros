/**
 * Pure deadline math for supplier response timers.
 *
 * A request invite (`request_suppliers`) must be answered within
 * `app_settings.response_deadline_days` **calendar** days of `sent_at`. Per
 * F007 (`ai_docs/develop/features/F007-win-reject-timer.md`) and the Phase 3
 * plan the rule is:
 *
 *   deadline_at = sent_at + (response_deadline_days * interval '1 day')
 *
 * counted in the **Europe/Moscow** timezone (the day boundary is MSK midnight,
 * not UTC). This module only computes the deadline at send time; the actual
 * expiry / cron / pause logic is Phase 7 and intentionally lives elsewhere.
 *
 * Everything here is pure and deterministic: no DB, no network, no implicit
 * `Date.now()` — callers pass the reference instant in. Functions never throw
 * for malformed settings input; they fall back to the documented default.
 */

/** Default response window in calendar days (F007: `response_deadline_days`). */
export const DEFAULT_RESPONSE_DEADLINE_DAYS = 10;

/** Minimum allowed response window; values below this fall back to default. */
export const MIN_RESPONSE_DEADLINE_DAYS = 1;

/** IANA timezone the business operates in. */
export const BUSINESS_TIME_ZONE = "Europe/Moscow";

/** Options for {@link computeDeadline}, mainly to make tests timezone-explicit. */
export interface ComputeDeadlineOptions {
  /** IANA timezone whose calendar-day boundary is used. Defaults to MSK. */
  timeZone?: string;
}

/** Wall-clock parts of an instant as seen in a given timezone. */
interface WallClockParts {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
  hour: number; // 0-23
  minute: number; // 0-59
  second: number; // 0-59
  millisecond: number; // 0-999
}

/**
 * Compute the response deadline as `sentAt` plus `deadlineDays` **calendar**
 * days, with the day boundary evaluated in the business timezone (MSK).
 *
 * The wall-clock time-of-day is preserved: an invite sent at 14:30 MSK is due
 * at 14:30 MSK `deadlineDays` later. Because the date arithmetic is done on the
 * MSK calendar, sends near the UTC/MSK midnight boundary land on the correct
 * day, and month/year/leap-day rollovers are handled by normal calendar
 * normalization.
 *
 * @param sentAt The instant the invite was sent (a UTC `Date`).
 * @param deadlineDays Whole calendar days to add (typically 1..N; see
 *   {@link parseDeadlineDays}). Non-finite or negative values are treated as 0.
 * @param opts Optional timezone override (defaults to {@link BUSINESS_TIME_ZONE}).
 * @returns A `Date` representing the deadline instant (UTC).
 */
export function computeDeadline(
  sentAt: Date,
  deadlineDays: number,
  opts: ComputeDeadlineOptions = {},
): Date {
  const timeZone = opts.timeZone ?? BUSINESS_TIME_ZONE;
  const days = Number.isFinite(deadlineDays) ? Math.trunc(deadlineDays) : 0;
  const addDays = days > 0 ? days : 0;

  const parts = getWallClockParts(sentAt, timeZone);
  return wallClockToInstant(
    {
      ...parts,
      day: parts.day + addDays,
    },
    timeZone,
  );
}

/**
 * Parse the `response_deadline_days` app setting (stored as key-value text).
 *
 * Accepts an integer string like `"10"`. Anything invalid — `null`, empty,
 * non-numeric, non-integer, or below {@link MIN_RESPONSE_DEADLINE_DAYS} (e.g.
 * `0` or negatives) — falls back to `fallback`.
 *
 * @param value Raw setting value (`app_settings.value`) or `null`.
 * @param fallback Default to use when `value` is missing/invalid.
 * @returns A safe positive integer day count.
 */
export function parseDeadlineDays(
  value: string | null | undefined,
  fallback: number = DEFAULT_RESPONSE_DEADLINE_DAYS,
): number {
  const safeFallback =
    Number.isInteger(fallback) && fallback >= MIN_RESPONSE_DEADLINE_DAYS
      ? fallback
      : DEFAULT_RESPONSE_DEADLINE_DAYS;

  if (value == null) return safeFallback;

  const trimmed = value.trim();
  if (!/^[+-]?\d+$/.test(trimmed)) return safeFallback;

  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isInteger(parsed) || parsed < MIN_RESPONSE_DEADLINE_DAYS) {
    return safeFallback;
  }
  return parsed;
}

/**
 * Whether `deadlineAt` has passed relative to `now`.
 *
 * Pure comparison only — no timer pause / status logic (that is Phase 7).
 *
 * @param deadlineAt The deadline instant (e.g. from {@link computeDeadline}).
 * @param now Reference instant; pass explicitly to keep callers deterministic.
 */
export function isOverdue(deadlineAt: Date, now: Date): boolean {
  return now.getTime() > deadlineAt.getTime();
}

/**
 * Whole calendar days remaining until `deadlineAt`, evaluated on the business
 * timezone calendar (so it matches the "До ответа: N дн." UI badge).
 *
 * Returns the difference in MSK calendar dates: `0` on the deadline's own day,
 * negative once overdue. Time-of-day within a day is ignored.
 *
 * @param deadlineAt The deadline instant.
 * @param now Reference instant.
 * @param opts Optional timezone override (defaults to {@link BUSINESS_TIME_ZONE}).
 */
export function daysUntilDeadline(
  deadlineAt: Date,
  now: Date,
  opts: ComputeDeadlineOptions = {},
): number {
  const timeZone = opts.timeZone ?? BUSINESS_TIME_ZONE;
  const deadlineDay = startOfDayUtcOrdinal(deadlineAt, timeZone);
  const nowDay = startOfDayUtcOrdinal(now, timeZone);
  const msPerDay = 86_400_000;
  return Math.round((deadlineDay - nowDay) / msPerDay);
}

/**
 * Extend a deadline by the duration the response timer was paused.
 *
 * When an invite leaves `clarification`, the elapsed pause
 * (`resumedAt - pausedAt`) is added to `deadlineAt` so the supplier keeps the
 * same remaining window. Uses millisecond arithmetic on the stored instants.
 *
 * @param deadlineAt Current deadline before resume.
 * @param pausedAt When the timer was paused (`timer_paused_at`).
 * @param resumedAt Reference instant for resume (typically `now`).
 * @returns Unchanged `deadlineAt` when pause duration is non-positive.
 */
export function extendDeadlineByPauseDuration(
  deadlineAt: Date,
  pausedAt: Date,
  resumedAt: Date,
): Date {
  const pauseMs = resumedAt.getTime() - pausedAt.getTime();
  if (!Number.isFinite(pauseMs) || pauseMs <= 0) {
    return deadlineAt;
  }
  return new Date(deadlineAt.getTime() + pauseMs);
}

/** Read the timezone wall-clock parts of an instant. */
function getWallClockParts(instant: Date, timeZone: string): WallClockParts {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const lookup: Record<string, number> = {};
  for (const { type, value } of formatter.formatToParts(instant)) {
    if (type !== "literal") lookup[type] = Number(value);
  }

  return {
    year: lookup.year,
    month: lookup.month,
    day: lookup.day,
    hour: lookup.hour === 24 ? 0 : lookup.hour,
    minute: lookup.minute,
    second: lookup.second,
    // Sub-second precision is invisible to Intl; timezone offsets are whole
    // minutes, so the UTC milliseconds are identical to the wall-clock ones.
    millisecond: instant.getMilliseconds(),
  };
}

/**
 * Convert timezone wall-clock parts back to a UTC instant.
 *
 * Day/month overflow (e.g. day 32, or +N days past month end) is normalized by
 * `Date.UTC`. The timezone offset is measured at the target instant so the
 * result is correct even if the zone's offset ever changes (MSK is a fixed
 * UTC+3 today, but this stays correct regardless).
 */
function wallClockToInstant(parts: WallClockParts, timeZone: string): Date {
  const asIfUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
    parts.millisecond,
  );
  const offsetMs = timeZoneOffsetMs(new Date(asIfUtc), timeZone);
  return new Date(asIfUtc - offsetMs);
}

/**
 * The signed offset (ms) of `timeZone` from UTC at the given instant.
 * Positive east of UTC — Europe/Moscow yields +3h (10_800_000 ms).
 */
function timeZoneOffsetMs(instant: Date, timeZone: string): number {
  const parts = getWallClockParts(instant, timeZone);
  const wallAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
    parts.millisecond,
  );
  return wallAsUtc - instant.getTime();
}

/** Ordinal (ms) of the timezone-local midnight that contains `instant`. */
function startOfDayUtcOrdinal(instant: Date, timeZone: string): number {
  const parts = getWallClockParts(instant, timeZone);
  return Date.UTC(parts.year, parts.month - 1, parts.day);
}

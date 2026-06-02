import { describe, expect, it } from "vitest";

import {
  DEFAULT_RESPONSE_DEADLINE_DAYS,
  computeDeadline,
  daysUntilDeadline,
  extendDeadlineByPauseDuration,
  isOverdue,
  parseDeadlineDays,
} from "@/lib/deadline";

/**
 * Tests for the pure deadline math used by supplier response timers.
 *
 * Europe/Moscow is a fixed UTC+3 zone (no DST since 2014), so adding N calendar
 * days at the same MSK wall-clock time equals adding N*24h to the instant. The
 * suite asserts both the absolute ISO results and the MSK-boundary behaviour:
 * two instants that share a UTC date but differ in MSK date must be treated as
 * different calendar days. All inputs are explicit instants — no Date.now().
 */

const iso = (date: Date) => date.toISOString();

describe("computeDeadline — basic N-day shift", () => {
  it("adds N calendar days preserving the MSK wall-clock time-of-day", () => {
    // 10:00Z == 13:00 MSK; +10 days stays 13:00 MSK == 10:00Z.
    const sentAt = new Date("2026-06-01T10:00:00.000Z");
    expect(iso(computeDeadline(sentAt, 10))).toBe("2026-06-11T10:00:00.000Z");
  });

  it("equals sent_at + N*24h under the fixed MSK offset", () => {
    const sentAt = new Date("2026-06-01T10:00:00.000Z");
    const expected = new Date(sentAt.getTime() + 10 * 86_400_000);
    expect(computeDeadline(sentAt, 10).getTime()).toBe(expected.getTime());
  });

  it("uses the default window of 10 days when passed through parse", () => {
    const sentAt = new Date("2026-06-01T00:00:00.000Z");
    const days = parseDeadlineDays(null);
    expect(days).toBe(DEFAULT_RESPONSE_DEADLINE_DAYS);
    expect(iso(computeDeadline(sentAt, days))).toBe("2026-06-11T00:00:00.000Z");
  });
});

describe("computeDeadline — month / year / leap-day rollover", () => {
  it("rolls over the end of a month", () => {
    // 00:00Z == 03:00 MSK on 2026-01-25; +10 days -> 2026-02-04 03:00 MSK.
    const sentAt = new Date("2026-01-25T00:00:00.000Z");
    expect(iso(computeDeadline(sentAt, 10))).toBe("2026-02-04T00:00:00.000Z");
  });

  it("rolls over the end of a year", () => {
    // 21:00Z 2025-12-28 == 00:00 MSK 2025-12-29; +5 days -> 2026-01-03 00:00 MSK.
    const sentAt = new Date("2025-12-28T21:00:00.000Z");
    expect(iso(computeDeadline(sentAt, 5))).toBe("2026-01-02T21:00:00.000Z");
  });

  it("lands on Feb 29 in a leap year", () => {
    // 09:00Z 2024-02-26 == 12:00 MSK; +3 days -> 2024-02-29 12:00 MSK.
    const sentAt = new Date("2024-02-26T09:00:00.000Z");
    expect(iso(computeDeadline(sentAt, 3))).toBe("2024-02-29T09:00:00.000Z");
  });

  it("skips a non-existent Feb 29 in a common year (normalizes to Mar)", () => {
    // 09:00Z 2025-02-26 == 12:00 MSK; +3 days -> 2025-03-01 12:00 MSK.
    const sentAt = new Date("2025-02-26T09:00:00.000Z");
    expect(iso(computeDeadline(sentAt, 3))).toBe("2025-03-01T09:00:00.000Z");
  });
});

describe("computeDeadline — MSK boundary near UTC midnight", () => {
  it("treats a late-UTC send as the next MSK calendar day", () => {
    // 22:00Z 2026-06-01 == 01:00 MSK 2026-06-02; +1 day -> 01:00 MSK 2026-06-03.
    const sentAt = new Date("2026-06-01T22:00:00.000Z");
    expect(iso(computeDeadline(sentAt, 1))).toBe("2026-06-02T22:00:00.000Z");
  });

  it("handles a send exactly at MSK midnight", () => {
    // 21:00Z == 00:00 MSK 2026-06-10; +10 days -> 00:00 MSK 2026-06-20.
    const sentAt = new Date("2026-06-09T21:00:00.000Z");
    expect(iso(computeDeadline(sentAt, 10))).toBe("2026-06-19T21:00:00.000Z");
  });

  it("preserves the wall-clock minute precision across the shift", () => {
    const sentAt = new Date("2026-03-15T20:45:30.500Z");
    const result = computeDeadline(sentAt, 7);
    expect(iso(result)).toBe("2026-03-22T20:45:30.500Z");
  });
});

describe("computeDeadline — N=0 and out-of-range days", () => {
  it("returns the same instant for N=0", () => {
    const sentAt = new Date("2026-06-01T10:00:00.000Z");
    expect(computeDeadline(sentAt, 0).getTime()).toBe(sentAt.getTime());
  });

  it("treats negative day counts as 0 (no shift)", () => {
    const sentAt = new Date("2026-06-01T10:00:00.000Z");
    expect(computeDeadline(sentAt, -5).getTime()).toBe(sentAt.getTime());
  });

  it("truncates fractional days toward zero", () => {
    const sentAt = new Date("2026-06-01T10:00:00.000Z");
    expect(iso(computeDeadline(sentAt, 2.9))).toBe("2026-06-03T10:00:00.000Z");
  });

  it("treats NaN day counts as 0", () => {
    const sentAt = new Date("2026-06-01T10:00:00.000Z");
    expect(computeDeadline(sentAt, Number.NaN).getTime()).toBe(sentAt.getTime());
  });

  it("supports a large day count crossing several months", () => {
    const sentAt = new Date("2026-01-15T09:00:00.000Z");
    // +100 days from 2026-01-15 (MSK 12:00) -> 2026-04-25 12:00 MSK.
    expect(iso(computeDeadline(sentAt, 100))).toBe("2026-04-25T09:00:00.000Z");
  });
});

describe("parseDeadlineDays", () => {
  it("parses a valid integer string", () => {
    expect(parseDeadlineDays("10")).toBe(10);
    expect(parseDeadlineDays("1")).toBe(1);
    expect(parseDeadlineDays("  7  ")).toBe(7);
  });

  it("falls back to 10 for null / undefined / empty", () => {
    expect(parseDeadlineDays(null)).toBe(10);
    expect(parseDeadlineDays(undefined)).toBe(10);
    expect(parseDeadlineDays("")).toBe(10);
    expect(parseDeadlineDays("   ")).toBe(10);
  });

  it("falls back to 10 for non-numeric or non-integer junk", () => {
    expect(parseDeadlineDays("garbage")).toBe(10);
    expect(parseDeadlineDays("10.5")).toBe(10);
    expect(parseDeadlineDays("1e3")).toBe(10);
    expect(parseDeadlineDays("10 days")).toBe(10);
  });

  it("falls back to 10 for zero and negative values (min >= 1)", () => {
    expect(parseDeadlineDays("0")).toBe(10);
    expect(parseDeadlineDays("-5")).toBe(10);
  });

  it("honors a custom valid fallback", () => {
    expect(parseDeadlineDays("nope", 14)).toBe(14);
    expect(parseDeadlineDays(null, 3)).toBe(3);
  });

  it("sanitizes an invalid custom fallback back to the default", () => {
    expect(parseDeadlineDays("nope", 0)).toBe(10);
    expect(parseDeadlineDays("nope", -1)).toBe(10);
    expect(parseDeadlineDays("nope", 2.5)).toBe(10);
  });
});

describe("isOverdue", () => {
  const deadline = new Date("2026-06-11T10:00:00.000Z");

  it("is false before the deadline", () => {
    expect(isOverdue(deadline, new Date("2026-06-11T09:59:59.999Z"))).toBe(false);
  });

  it("is false exactly at the deadline", () => {
    expect(isOverdue(deadline, new Date("2026-06-11T10:00:00.000Z"))).toBe(false);
  });

  it("is true once past the deadline", () => {
    expect(isOverdue(deadline, new Date("2026-06-11T10:00:00.001Z"))).toBe(true);
  });
});

describe("extendDeadlineByPauseDuration", () => {
  it("adds the pause duration in milliseconds to the deadline", () => {
    const deadlineAt = new Date("2026-06-11T10:00:00.000Z");
    const pausedAt = new Date("2026-06-01T10:00:00.000Z");
    const resumedAt = new Date("2026-06-03T10:00:00.000Z");
    const result = extendDeadlineByPauseDuration(deadlineAt, pausedAt, resumedAt);
    expect(result.toISOString()).toBe("2026-06-13T10:00:00.000Z");
  });

  it("returns the same deadline when pause duration is zero or negative", () => {
    const deadlineAt = new Date("2026-06-11T10:00:00.000Z");
    const pausedAt = new Date("2026-06-03T10:00:00.000Z");
    expect(
      extendDeadlineByPauseDuration(
        deadlineAt,
        pausedAt,
        new Date("2026-06-03T10:00:00.000Z"),
      ).getTime(),
    ).toBe(deadlineAt.getTime());
    expect(
      extendDeadlineByPauseDuration(
        deadlineAt,
        pausedAt,
        new Date("2026-06-02T10:00:00.000Z"),
      ).getTime(),
    ).toBe(deadlineAt.getTime());
  });
});

describe("daysUntilDeadline — counted on the MSK calendar", () => {
  it("returns whole days between MSK calendar dates", () => {
    const deadline = new Date("2026-06-11T10:00:00.000Z");
    const now = new Date("2026-06-01T10:00:00.000Z");
    expect(daysUntilDeadline(deadline, now)).toBe(10);
  });

  it("returns 0 on the deadline's own MSK day regardless of time-of-day", () => {
    const deadline = new Date("2026-06-11T07:00:00.000Z"); // 10:00 MSK
    const now = new Date("2026-06-11T20:00:00.000Z"); // 23:00 MSK same MSK day
    expect(daysUntilDeadline(deadline, now)).toBe(0);
  });

  it("uses MSK day boundaries, not UTC ones", () => {
    // Both instants fall on 2026-06-10 in UTC, but in MSK the deadline is
    // 2026-06-11 (01:00) and now is 2026-06-10 (23:00) -> 1 day apart.
    const deadline = new Date("2026-06-10T22:00:00.000Z");
    const now = new Date("2026-06-10T20:00:00.000Z");
    expect(daysUntilDeadline(deadline, now)).toBe(1);
  });

  it("returns a negative count once overdue", () => {
    const deadline = new Date("2026-06-11T10:00:00.000Z");
    const now = new Date("2026-06-13T10:00:00.000Z");
    expect(daysUntilDeadline(deadline, now)).toBe(-2);
  });
});

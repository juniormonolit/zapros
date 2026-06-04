import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  aggregateRequestAfterExpire,
  computeExpiredInviteUpdates,
  shouldExpireInvite,
} from "@/lib/expire-invites";

const iso = (value: string) => new Date(value);

describe("shouldExpireInvite", () => {
  const now = iso("2026-06-15T12:00:00.000Z");
  const pastDeadline = iso("2026-06-10T12:00:00.000Z");
  const futureDeadline = iso("2026-06-20T12:00:00.000Z");

  it("expires overdue new invites without a pause", () => {
    expect(shouldExpireInvite("new", pastDeadline, null, now)).toBe(true);
  });

  it("does not expire when the deadline is still in the future", () => {
    expect(shouldExpireInvite("new", futureDeadline, null, now)).toBe(false);
  });

  it("does not expire paused clarification invites", () => {
    expect(
      shouldExpireInvite(
        "clarification",
        pastDeadline,
        iso("2026-06-14T12:00:00.000Z"),
        now,
      ),
    ).toBe(false);
  });

  it("does not expire invites that already received a response", () => {
    expect(shouldExpireInvite("answered", pastDeadline, null, now)).toBe(false);
    expect(shouldExpireInvite("under_review", pastDeadline, null, now)).toBe(
      false,
    );
    expect(shouldExpireInvite("in_progress", pastDeadline, null, now)).toBe(
      false,
    );
  });

  it("does not expire final invite statuses", () => {
    expect(shouldExpireInvite("lost", pastDeadline, null, now)).toBe(false);
    expect(shouldExpireInvite("won", pastDeadline, null, now)).toBe(false);
    expect(shouldExpireInvite("no_response", pastDeadline, null, now)).toBe(
      false,
    );
  });
});

describe("computeExpiredInviteUpdates", () => {
  const now = iso("2026-06-15T12:00:00.000Z");
  const pastDeadline = "2026-06-10T12:00:00.000Z";

  it("returns ids only for invites that should expire", () => {
    const ids = computeExpiredInviteUpdates(
      [
        { id: "a", status: "new", deadlineAt: pastDeadline, timerPausedAt: null },
        {
          id: "b",
          status: "answered",
          deadlineAt: pastDeadline,
          timerPausedAt: null,
        },
        {
          id: "c",
          status: "new",
          deadlineAt: "2026-06-20T12:00:00.000Z",
          timerPausedAt: null,
        },
      ],
      now,
    );

    expect(ids).toEqual(["a"]);
  });
});

describe("aggregateRequestAfterExpire", () => {
  it("archives the request when every invite is no_response and nobody answered", () => {
    expect(
      aggregateRequestAfterExpire(["no_response", "no_response"], false),
    ).toBe("no_response");
  });

  it("keeps the request open when at least one supplier answered", () => {
    expect(
      aggregateRequestAfterExpire(["no_response", "answered"], true),
    ).toBeNull();
  });

  it("keeps the request open while some invites are still active", () => {
    expect(aggregateRequestAfterExpire(["no_response", "new"], false)).toBeNull();
  });
});

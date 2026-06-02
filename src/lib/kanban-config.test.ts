import { describe, expect, it } from "vitest";

import {
  FORBIDDEN_MANUAL_REQUEST_TARGETS,
  REQUEST_FILTER_PRESET_IN_WORK,
  REQUEST_KANBAN_COLUMNS,
  REQUEST_KANBAN_HIDDEN_STATUSES,
  REQUEST_KANBAN_VISIBLE_STATUSES,
  allowedRequestDropTargets,
  applyPresetInWork,
  defaultRequestFilters,
  filterRequestByState,
  isManualRequestTransition,
} from "@/lib/kanban-config";

const defaultFilters = defaultRequestFilters();

describe("REQUEST_KANBAN_COLUMNS", () => {
  it("lists visible working columns before hidden finals", () => {
    const visible = REQUEST_KANBAN_COLUMNS.filter((col) => col.visibleDefault);
    const hidden = REQUEST_KANBAN_COLUMNS.filter((col) => !col.visibleDefault);

    expect(visible.map((col) => col.id)).toEqual([
      ...REQUEST_KANBAN_VISIBLE_STATUSES,
    ]);
    expect(hidden.map((col) => col.id)).toEqual([...REQUEST_KANBAN_HIDDEN_STATUSES]);
  });
});

describe("REQUEST_FILTER_PRESET_IN_WORK", () => {
  it("matches the «Запрос в работе» stage group from status-machines.md", () => {
    expect([...REQUEST_FILTER_PRESET_IN_WORK]).toEqual([
      "new",
      "awaiting_responses",
      "has_response",
      "clarification",
      "in_progress",
    ]);
  });
});

describe("isManualRequestTransition", () => {
  const working = [
    "new",
    "awaiting_responses",
    "has_response",
    "clarification",
    "in_progress",
  ] as const;

  it("allows every cross-column move within the working matrix", () => {
    for (const from of working) {
      for (const to of working) {
        if (from === to) continue;
        expect(isManualRequestTransition(from, to)).toBe(true);
      }
    }
  });

  it("rejects staying in the same column", () => {
    expect(isManualRequestTransition("new", "new")).toBe(false);
    expect(isManualRequestTransition("in_progress", "in_progress")).toBe(false);
  });

  it("rejects Phase 7 / terminal targets", () => {
    for (const from of working) {
      for (const forbidden of FORBIDDEN_MANUAL_REQUEST_TARGETS) {
        expect(isManualRequestTransition(from, forbidden)).toBe(false);
      }
    }
  });

  it("rejects transitions from non-working statuses", () => {
    expect(isManualRequestTransition("won", "new")).toBe(false);
    expect(isManualRequestTransition("draft", "new")).toBe(false);
  });
});

describe("allowedRequestDropTargets", () => {
  it("returns all other working columns for a visible status", () => {
    expect(allowedRequestDropTargets("has_response").sort()).toEqual(
      ["new", "awaiting_responses", "clarification", "in_progress"].sort(),
    );
  });

  it("returns empty list for non-working columns", () => {
    expect(allowedRequestDropTargets("won")).toEqual([]);
    expect(allowedRequestDropTargets("draft")).toEqual([]);
  });
});

describe("defaultRequestFilters / applyPresetInWork", () => {
  it("defaults to in-work preset statuses", () => {
    expect(defaultRequestFilters().preset).toBe("in_work");
    expect(defaultRequestFilters().statuses).toEqual([
      ...REQUEST_FILTER_PRESET_IN_WORK,
    ]);
    expect(applyPresetInWork()).toEqual(defaultRequestFilters());
  });
});

describe("filterRequestByState", () => {
  const row = {
    id: "r1",
    requestCode: "R-1",
    status: "won",
    sentAt: null,
    createdAt: "2026-06-01T12:00:00.000Z",
    taskId: "t1",
    taskNumber: 1,
    taskTitle: "Task",
    category: null,
    supplierIds: [],
    supplierCount: 0,
  };

  it("excludes drafts and hidden finals when showCompleted is false", () => {
    expect(
      filterRequestByState(
        { ...row, id: "d", status: "draft" },
        defaultFilters,
        false,
      ),
    ).toBe(false);
    expect(filterRequestByState(row, defaultFilters, false)).toBe(false);
  });

  it("includes hidden finals when showCompleted is true and preset is custom", () => {
    expect(
      filterRequestByState(
        row,
        { ...defaultFilters, preset: "custom", statuses: [] },
        true,
      ),
    ).toBe(true);
  });

  it("includes a hidden final when explicitly selected in statuses", () => {
    expect(
      filterRequestByState(
        row,
        { ...defaultFilters, statuses: ["won"] },
        false,
      ),
    ).toBe(true);
  });
});

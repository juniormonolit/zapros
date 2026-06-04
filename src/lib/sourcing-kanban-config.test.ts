import { describe, expect, it } from "vitest";

import {
  SOURCING_KANBAN_COLUMNS,
  allowedSourcingDropTargets,
  isSourcingTransitionAllowed,
  sourcingStatusForColumn,
} from "@/lib/sourcing-kanban-config";
import { SOURCING_STATUSES, SOURCING_STATUS_LABELS } from "@/lib/sourcing";

const CHAIN = [
  "new",
  "called",
  "clarified",
  "got_price",
  "test_order",
  "approved",
  "working_in_zapros",
] as const;

const NON_REJECTED = [...CHAIN] as const;

describe("SOURCING_KANBAN_COLUMNS", () => {
  it("defines 8 columns in SOURCING_STATUSES order with labels and variants", () => {
    expect(SOURCING_KANBAN_COLUMNS).toHaveLength(8);
    expect(SOURCING_KANBAN_COLUMNS.map((col) => col.id)).toEqual([
      ...SOURCING_STATUSES,
    ]);
    for (const col of SOURCING_KANBAN_COLUMNS) {
      const status = col.id as (typeof SOURCING_STATUSES)[number];
      expect(col.label).toBe(SOURCING_STATUS_LABELS[status]);
      expect(col.visibleDefault).toBe(true);
    }
    expect(SOURCING_KANBAN_COLUMNS.find((c) => c.id === "new")?.variant).toBe(
      "muted",
    );
    expect(
      SOURCING_KANBAN_COLUMNS.find((c) => c.id === "working_in_zapros")?.variant,
    ).toBe("success");
    expect(SOURCING_KANBAN_COLUMNS.find((c) => c.id === "rejected")?.variant).toBe(
      "danger",
    );
  });
});

describe("sourcingStatusForColumn", () => {
  it("maps each column id to its sourcing status", () => {
    for (const status of SOURCING_STATUSES) {
      expect(sourcingStatusForColumn(status)).toBe(status);
    }
    expect(sourcingStatusForColumn("unknown")).toBeNull();
  });
});

describe("isSourcingTransitionAllowed — matrix A", () => {
  it("allows ±1 moves along the funnel chain", () => {
    for (let i = 0; i < CHAIN.length; i++) {
      const from = CHAIN[i];
      if (i > 0) {
        expect(isSourcingTransitionAllowed(from, CHAIN[i - 1])).toBe(true);
      }
      if (i < CHAIN.length - 1) {
        expect(isSourcingTransitionAllowed(from, CHAIN[i + 1])).toBe(true);
      }
    }
  });

  it("allows reject from every non-rejected status", () => {
    for (const from of NON_REJECTED) {
      expect(isSourcingTransitionAllowed(from, "rejected")).toBe(true);
    }
  });

  it("allows only rejected → new", () => {
    expect(isSourcingTransitionAllowed("rejected", "new")).toBe(true);
    for (const to of SOURCING_STATUSES) {
      if (to === "new") continue;
      expect(isSourcingTransitionAllowed("rejected", to)).toBe(false);
    }
  });

  it("rejects staying in the same column", () => {
    for (const status of SOURCING_STATUSES) {
      expect(isSourcingTransitionAllowed(status, status)).toBe(false);
    }
  });

  it("rejects skip jumps along the chain", () => {
    expect(isSourcingTransitionAllowed("new", "got_price")).toBe(false);
    expect(isSourcingTransitionAllowed("new", "working_in_zapros")).toBe(false);
    expect(isSourcingTransitionAllowed("called", "got_price")).toBe(false);
    expect(
      isSourcingTransitionAllowed("working_in_zapros", "clarified"),
    ).toBe(false);
    expect(isSourcingTransitionAllowed("approved", "new")).toBe(false);
  });

  it("rejects transitions from rejected except to new", () => {
    expect(isSourcingTransitionAllowed("rejected", "called")).toBe(false);
    expect(isSourcingTransitionAllowed("rejected", "rejected")).toBe(false);
    expect(isSourcingTransitionAllowed("rejected", "working_in_zapros")).toBe(
      false,
    );
  });

  it("rejects transitions into chain from rejected targets other than new", () => {
    expect(isSourcingTransitionAllowed("rejected", "approved")).toBe(false);
  });

  it("rejects invalid status strings", () => {
    expect(isSourcingTransitionAllowed("new", "invalid")).toBe(false);
    expect(isSourcingTransitionAllowed("bogus", "new")).toBe(false);
  });
});

describe("allowedSourcingDropTargets", () => {
  it("returns neighbors and rejected for mid-chain statuses", () => {
    expect(allowedSourcingDropTargets("clarified").sort()).toEqual(
      ["called", "got_price", "rejected"].sort(),
    );
  });

  it("returns called and rejected for new", () => {
    expect(allowedSourcingDropTargets("new").sort()).toEqual(
      ["called", "rejected"].sort(),
    );
  });

  it("returns approved and rejected for working_in_zapros", () => {
    expect(allowedSourcingDropTargets("working_in_zapros").sort()).toEqual(
      ["approved", "rejected"].sort(),
    );
  });

  it("returns only new for rejected", () => {
    expect(allowedSourcingDropTargets("rejected")).toEqual(["new"]);
  });

  it("returns empty list for unknown from status", () => {
    expect(allowedSourcingDropTargets("not-a-status")).toEqual([]);
  });
});

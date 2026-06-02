import { describe, expect, it } from "vitest";

import {
  canFinalizeRequest,
  findOpenDuplicateRequestIds,
  inviteHasResponse,
  validateManualRejectReason,
} from "@/lib/request-finalization";

describe("canFinalizeRequest", () => {
  it("allows sent non-terminal statuses", () => {
    expect(canFinalizeRequest("awaiting_responses")).toBe(true);
    expect(canFinalizeRequest("has_response")).toBe(true);
    expect(canFinalizeRequest("in_progress")).toBe(true);
  });

  it("blocks draft and terminal statuses", () => {
    expect(canFinalizeRequest("draft")).toBe(false);
    expect(canFinalizeRequest("won")).toBe(false);
    expect(canFinalizeRequest("lost")).toBe(false);
    expect(canFinalizeRequest("cancelled")).toBe(false);
    expect(canFinalizeRequest("no_response")).toBe(false);
  });
});

describe("inviteHasResponse", () => {
  const base = {
    id: "inv-1",
    supplierId: "sup-1",
    status: "new",
    firstResponseAt: null,
  };

  it("returns true when first_response_at is set", () => {
    expect(
      inviteHasResponse({ ...base, firstResponseAt: "2026-06-01T10:00:00Z" }),
    ).toBe(true);
  });

  it("returns true for response-like invite statuses", () => {
    expect(inviteHasResponse({ ...base, status: "answered" })).toBe(true);
    expect(inviteHasResponse({ ...base, status: "under_review" })).toBe(true);
  });

  it("returns false for invites without a response", () => {
    expect(inviteHasResponse(base)).toBe(false);
    expect(inviteHasResponse({ ...base, status: "new" })).toBe(false);
  });
});

describe("validateManualRejectReason", () => {
  it("accepts manual reasons", () => {
    expect(validateManualRejectReason("price")).toBeNull();
    expect(validateManualRejectReason("no_response")).toBeNull();
  });

  it("rejects auto-only reasons", () => {
    expect(validateManualRejectReason("other_supplier_selected")).toMatch(
      /вручную/,
    );
  });

  it("requires comment for other", () => {
    expect(validateManualRejectReason("other")).toMatch(/комментарий/);
    expect(validateManualRejectReason("other", "  ")).toMatch(/комментарий/);
    expect(validateManualRejectReason("other", "details")).toBeNull();
  });
});

describe("findOpenDuplicateRequestIds", () => {
  it("returns open duplicates excluding the winner", () => {
    const ids = findOpenDuplicateRequestIds("win", [
      { requestId: "win", status: "has_response" },
      { requestId: "dup-a", status: "awaiting_responses" },
      { requestId: "dup-a", status: "awaiting_responses" },
      { requestId: "dup-b", status: "won" },
      { requestId: "dup-c", status: "draft" },
    ]);
    expect(ids).toEqual(["dup-a"]);
  });
});

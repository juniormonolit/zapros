import { describe, expect, it } from "vitest";

import {
  isAdminViewAsEnabled,
  resolveEffectiveDbUserId,
} from "@/lib/view-as-policy";

describe("isAdminViewAsEnabled", () => {
  it("is true when env is unset", () => {
    const prev = process.env.ENABLE_ADMIN_VIEW_AS;
    delete process.env.ENABLE_ADMIN_VIEW_AS;
    expect(isAdminViewAsEnabled()).toBe(true);
    process.env.ENABLE_ADMIN_VIEW_AS = prev;
  });

  it("is false when env is 'false'", () => {
    const prev = process.env.ENABLE_ADMIN_VIEW_AS;
    process.env.ENABLE_ADMIN_VIEW_AS = "false";
    expect(isAdminViewAsEnabled()).toBe(false);
    process.env.ENABLE_ADMIN_VIEW_AS = prev;
  });

  it("is true when env is explicitly 'true'", () => {
    const prev = process.env.ENABLE_ADMIN_VIEW_AS;
    process.env.ENABLE_ADMIN_VIEW_AS = "true";
    expect(isAdminViewAsEnabled()).toBe(true);
    process.env.ENABLE_ADMIN_VIEW_AS = prev;
  });
});

describe("resolveEffectiveDbUserId", () => {
  const sessionId = "session-user-id";
  const viewAsId = "view-as-user-id";

  it("returns session id without view-as cookie", () => {
    expect(
      resolveEffectiveDbUserId({
        sessionUserId: sessionId,
        sessionRole: "admin",
        viewAsUserId: null,
        viewAsEnabled: true,
        viewAsTargetActive: true,
      }),
    ).toBe(sessionId);
  });

  it("returns session id for non-admin even with cookie", () => {
    expect(
      resolveEffectiveDbUserId({
        sessionUserId: sessionId,
        sessionRole: "senior_procurement",
        viewAsUserId: viewAsId,
        viewAsEnabled: true,
        viewAsTargetActive: true,
      }),
    ).toBe(sessionId);
  });

  it("returns impersonated id for admin with valid view-as", () => {
    expect(
      resolveEffectiveDbUserId({
        sessionUserId: sessionId,
        sessionRole: "admin",
        viewAsUserId: viewAsId,
        viewAsEnabled: true,
        viewAsTargetActive: true,
      }),
    ).toBe(viewAsId);
  });

  it("ignores cookie when flag is off", () => {
    expect(
      resolveEffectiveDbUserId({
        sessionUserId: sessionId,
        sessionRole: "admin",
        viewAsUserId: viewAsId,
        viewAsEnabled: false,
        viewAsTargetActive: true,
      }),
    ).toBe(sessionId);
  });

  it("ignores empty view-as id", () => {
    expect(
      resolveEffectiveDbUserId({
        sessionUserId: sessionId,
        sessionRole: "admin",
        viewAsUserId: "",
        viewAsEnabled: true,
        viewAsTargetActive: true,
      }),
    ).toBe(sessionId);
  });

  it("falls back when session role is not admin", () => {
    expect(
      resolveEffectiveDbUserId({
        sessionUserId: sessionId,
        sessionRole: null,
        viewAsUserId: viewAsId,
        viewAsEnabled: true,
        viewAsTargetActive: true,
      }),
    ).toBe(sessionId);
  });

  it("falls back to session when target is inactive", () => {
    expect(
      resolveEffectiveDbUserId({
        sessionUserId: sessionId,
        sessionRole: "admin",
        viewAsUserId: viewAsId,
        viewAsEnabled: true,
        viewAsTargetActive: false,
      }),
    ).toBe(sessionId);
  });

  it("returns undefined without session", () => {
    expect(
      resolveEffectiveDbUserId({
        sessionUserId: undefined,
        sessionRole: "admin",
        viewAsUserId: viewAsId,
        viewAsEnabled: true,
        viewAsTargetActive: true,
      }),
    ).toBeUndefined();
  });
});

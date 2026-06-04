import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mockCookieGet = vi.fn();
const mockCookieSet = vi.fn();
const mockCookieDelete = vi.fn();

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: mockCookieGet,
    set: mockCookieSet,
    delete: mockCookieDelete,
  })),
}));

vi.mock("@/lib/auth", () => ({
  getProfile: vi.fn(),
}));

vi.mock("@/lib/admin-client", () => ({
  createAdminClient: vi.fn(),
}));

import { getProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/admin-client";
import { clearViewAsUserId, setViewAsUserId } from "@/actions/view-as";

const adminProfile = {
  id: "admin-id",
  role: "admin" as const,
  full_name: "Admin",
  supplier_id: null,
  is_active: true,
};

describe("setViewAsUserId", () => {
  let prevEnableFlag: string | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    prevEnableFlag = process.env.ENABLE_ADMIN_VIEW_AS;
    delete process.env.ENABLE_ADMIN_VIEW_AS;
  });

  afterEach(() => {
    if (prevEnableFlag === undefined) {
      delete process.env.ENABLE_ADMIN_VIEW_AS;
    } else {
      process.env.ENABLE_ADMIN_VIEW_AS = prevEnableFlag;
    }
  });

  it("rejects when view-as flag is off", async () => {
    process.env.ENABLE_ADMIN_VIEW_AS = "false";

    const result = await setViewAsUserId("target-user-id");

    expect(result).toEqual({ ok: false, error: "Просмотр от лица отключён." });
    expect(getProfile).not.toHaveBeenCalled();
    expect(mockCookieSet).not.toHaveBeenCalled();
  });

  it("rejects non-admin session", async () => {
    vi.mocked(getProfile).mockResolvedValue({
      ...adminProfile,
      id: "proc-id",
      role: "procurement",
    });

    const result = await setViewAsUserId("target-user-id");

    expect(result).toEqual({ ok: false, error: "Доступ запрещён." });
    expect(createAdminClient).not.toHaveBeenCalled();
    expect(mockCookieSet).not.toHaveBeenCalled();
  });
});

describe("clearViewAsUserId", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects non-admin session", async () => {
    vi.mocked(getProfile).mockResolvedValue({
      ...adminProfile,
      id: "supplier-id",
      role: "supplier",
    });

    const result = await clearViewAsUserId();

    expect(result).toEqual({ ok: false, error: "Доступ запрещён." });
    expect(mockCookieDelete).not.toHaveBeenCalled();
  });
});

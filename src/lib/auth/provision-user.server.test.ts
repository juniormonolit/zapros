import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/auth/users.server", () => ({
  createAuthUser: vi.fn(),
  deleteAuthUser: vi.fn(),
}));

vi.mock("@/lib/admin-client", () => ({
  createAdminClient: vi.fn(),
}));

import { createAuthUserWithProfile } from "@/lib/auth/provision-user.server";
import { createAuthUser, deleteAuthUser } from "@/lib/auth/users.server";
import { createAdminClient } from "@/lib/admin-client";

const userId = "user-uuid-1";
const supplierId = "supplier-uuid-1";

function buildAdminMock(options: {
  profileError?: { code: string } | null;
  memberError?: { code: string } | null;
}) {
  const memberInsert = vi.fn().mockResolvedValue({
    error: options.memberError ?? null,
  });
  const profileUpsert = vi.fn().mockResolvedValue({
    error: options.profileError ?? null,
  });

  const from = vi.fn().mockImplementation((table: string) => {
    if (table === "profiles") {
      return { upsert: profileUpsert };
    }
    if (table === "supplier_members") {
      return { insert: memberInsert };
    }
    throw new Error(`Unexpected table: ${table}`);
  });

  return { from, profileUpsert, memberInsert };
}

describe("createAuthUserWithProfile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createAuthUser).mockResolvedValue({ id: userId });
    vi.mocked(deleteAuthUser).mockResolvedValue(undefined);
  });

  it("creates supplier_admin membership when role is supplier", async () => {
    const admin = buildAdminMock({});
    vi.mocked(createAdminClient).mockReturnValue(admin);

    const result = await createAuthUserWithProfile({
      email: "supplier@example.com",
      password: "password123",
      role: "supplier",
      fullName: "ООО Тест",
      supplierId,
    });

    expect(result).toEqual({ ok: true, userId });
    expect(admin.memberInsert).toHaveBeenCalledWith({
      user_id: userId,
      supplier_id: supplierId,
      member_role: "supplier_admin",
      is_active: true,
    });
    expect(deleteAuthUser).not.toHaveBeenCalled();
  });

  it("skips membership for non-supplier roles", async () => {
    const admin = buildAdminMock({});
    vi.mocked(createAdminClient).mockReturnValue(admin);

    const result = await createAuthUserWithProfile({
      email: "buyer@example.com",
      password: "password123",
      role: "procurement",
      fullName: "Buyer",
      supplierId: null,
    });

    expect(result).toEqual({ ok: true, userId });
    expect(admin.memberInsert).not.toHaveBeenCalled();
  });

  it("rolls back auth user when membership insert fails", async () => {
    const admin = buildAdminMock({ memberError: { code: "23505" } });
    vi.mocked(createAdminClient).mockReturnValue(admin);

    const result = await createAuthUserWithProfile({
      email: "supplier@example.com",
      password: "password123",
      role: "supplier",
      fullName: "ООО Тест",
      supplierId,
    });

    expect(result).toEqual({
      ok: false,
      error: "Не удалось создать членство в организации поставщика.",
      code: "23505",
    });
    expect(deleteAuthUser).toHaveBeenCalledWith(userId);
  });
});

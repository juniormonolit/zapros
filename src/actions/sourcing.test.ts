import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * F010 sourcing actions — regression anchor for F012 supplier-org (SRC-710):
 * org CRUD lives in supplier-org.test.ts; these tests must keep passing when
 * /admin/suppliers or junction tables change.
 */

vi.mock("server-only", () => ({}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  getEffectiveProfile: vi.fn(),
}));

vi.mock("@/lib/app-client", () => ({
  createClient: vi.fn(),
}));

vi.mock("@/lib/admin-client", () => ({
  createAdminClient: vi.fn(),
}));

vi.mock("@/lib/sourcing-kanban-config", () => ({
  isSourcingTransitionAllowed: vi.fn(),
}));

vi.mock("@/lib/auth/provision-user.server", () => ({
  createAuthUserWithProfile: vi.fn(),
}));

vi.mock("@/lib/auth/users.server", () => ({
  emailExists: vi.fn(),
}));

import {
  createSourcingSupplier,
  provisionSupplierUser,
  updateSupplierSourcingStatus,
} from "@/actions/sourcing";
import { getEffectiveProfile } from "@/lib/auth";
import { createClient } from "@/lib/app-client";
import { createAdminClient } from "@/lib/admin-client";
import { isSourcingTransitionAllowed } from "@/lib/sourcing-kanban-config";
import { createAuthUserWithProfile } from "@/lib/auth/provision-user.server";
import { emailExists } from "@/lib/auth/users.server";
import { revalidatePath } from "next/cache";
import {
  DEFAULT_SOURCING_STATUS,
  WORKING_IN_ZAPROS_STATUS,
  deriveWorksInZapros,
} from "@/lib/sourcing";

const NEEDS_EMAIL_MESSAGE =
  "Укажите email на карточке поставщика перед переходом на стадию «Работает в Zapros».";

const seniorProfile = {
  id: "senior-id",
  role: "senior_procurement" as const,
  full_name: "Senior",
  supplier_id: null,
  is_active: true,
};

const procurementProfile = {
  ...seniorProfile,
  id: "proc-id",
  role: "procurement" as const,
};

const supplierId = "supplier-uuid";

type SelectResult = {
  data: Record<string, unknown> | null;
  error: { message: string } | null;
};

function buildAppSupabaseMock(options: {
  selectResult?: SelectResult;
  updateError?: { message: string } | null;
  insertError?: { message: string } | null;
  onInsert?: (payload: Record<string, unknown>) => void;
}) {
  const maybeSingle = vi.fn().mockResolvedValue(
    options.selectResult ?? { data: null, error: null },
  );
  const selectEq = vi.fn().mockReturnValue({ maybeSingle });
  const select = vi.fn().mockReturnValue({ eq: selectEq });

  const updateEq = vi.fn().mockResolvedValue({
    error: options.updateError ?? null,
  });
  const update = vi.fn().mockReturnValue({ eq: updateEq });

  const insert = vi.fn().mockImplementation((payload: Record<string, unknown>) => {
    options.onInsert?.(payload);
    return Promise.resolve({ error: options.insertError ?? null });
  });

  const from = vi.fn().mockReturnValue({ select, update, insert });

  return { from, insert, update, maybeSingle };
}

function buildAdminSupabaseMock(activeMemberCount: number) {
  const finalEq = vi.fn().mockResolvedValue({
    count: activeMemberCount,
    error: null,
  });
  const eq1 = vi.fn().mockReturnValue({ eq: finalEq });
  const select = vi.fn().mockReturnValue({ eq: eq1 });
  const from = vi.fn().mockReturnValue({ select });
  return { from };
}

describe("updateSupplierSourcingStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getEffectiveProfile).mockResolvedValue(seniorProfile);
    vi.mocked(isSourcingTransitionAllowed).mockReturnValue(true);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("denies transition for procurement effective profile", async () => {
    vi.mocked(getEffectiveProfile).mockResolvedValue(procurementProfile);

    const result = await updateSupplierSourcingStatus(supplierId, "called");

    expect(result).toEqual({
      ok: false,
      error: "Недостаточно прав для выполнения операции.",
    });
    expect(createClient).not.toHaveBeenCalled();
    expect(isSourcingTransitionAllowed).not.toHaveBeenCalled();
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it("returns needsProvision when moving to working_in_zapros without active user", async () => {
    const appSupabase = buildAppSupabaseMock({
      selectResult: {
        data: {
          id: supplierId,
          sourcing_status: "approved",
          email: "supplier@example.com",
        },
        error: null,
      },
    });
    vi.mocked(createClient).mockResolvedValue(appSupabase);
    vi.mocked(createAdminClient).mockReturnValue(buildAdminSupabaseMock(0));

    const result = await updateSupplierSourcingStatus(
      supplierId,
      WORKING_IN_ZAPROS_STATUS,
    );

    expect(result).toEqual({ ok: false, needsProvision: true });
    expect(appSupabase.update).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
    expect(isSourcingTransitionAllowed).toHaveBeenCalledWith(
      "approved",
      WORKING_IN_ZAPROS_STATUS,
    );
  });

  it("returns email empty error when moving to working_in_zapros without user or email", async () => {
    const appSupabase = buildAppSupabaseMock({
      selectResult: {
        data: {
          id: supplierId,
          sourcing_status: "approved",
          email: null,
        },
        error: null,
      },
    });
    vi.mocked(createClient).mockResolvedValue(appSupabase);
    vi.mocked(createAdminClient).mockReturnValue(buildAdminSupabaseMock(0));

    const result = await updateSupplierSourcingStatus(
      supplierId,
      WORKING_IN_ZAPROS_STATUS,
    );

    expect(result).toEqual({ ok: false, error: NEEDS_EMAIL_MESSAGE });
    expect(appSupabase.update).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe("createSourcingSupplier", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getEffectiveProfile).mockResolvedValue(seniorProfile);
  });

  it("always sets sourcing_status to new on insert", async () => {
    let inserted: Record<string, unknown> | undefined;
    const appSupabase = buildAppSupabaseMock({
      onInsert: (payload) => {
        inserted = payload;
      },
    });
    vi.mocked(createClient).mockResolvedValue(appSupabase);

    const formData = new FormData();
    formData.set("name", "ООО Тест");
    formData.set("contact_person", "Иван");
    formData.set("phone", "+7 900 000-00-00");
    formData.set("email", "test@supplier.ru");

    const result = await createSourcingSupplier(
      { error: null, ok: false },
      formData,
    );

    expect(result).toEqual({ error: null, ok: true });
    expect(inserted).toEqual({
      name: "ООО Тест",
      contact_person: "Иван",
      phone: "+7 900 000-00-00",
      email: "test@supplier.ru",
      sourcing_status: DEFAULT_SOURCING_STATUS,
      works_in_zapros: deriveWorksInZapros(DEFAULT_SOURCING_STATUS),
    });
    expect(revalidatePath).toHaveBeenCalledWith("/sourcing");
    expect(revalidatePath).toHaveBeenCalledWith("/admin/suppliers");
  });
});

describe("provisionSupplierUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getEffectiveProfile).mockResolvedValue(seniorProfile);
    vi.mocked(emailExists).mockResolvedValue(false);
    vi.mocked(createAuthUserWithProfile).mockResolvedValue({
      ok: true,
      userId: "new-user-id",
    });
  });

  it("creates auth profile with supplier_admin membership via helper", async () => {
    const appSupabase = buildAppSupabaseMock({
      selectResult: {
        data: { id: supplierId, name: "ООО Тест" },
        error: null,
      },
    });
    vi.mocked(createClient).mockResolvedValue(appSupabase);
    vi.mocked(createAdminClient).mockReturnValue(buildAdminSupabaseMock(0));

    const result = await provisionSupplierUser(
      supplierId,
      "supplier@example.com",
      "password123",
    );

    expect(result).toEqual({ ok: true, userId: "new-user-id" });
    expect(createAuthUserWithProfile).toHaveBeenCalledWith({
      email: "supplier@example.com",
      password: "password123",
      role: "supplier",
      fullName: "ООО Тест",
      supplierId,
    });
    expect(revalidatePath).toHaveBeenCalledWith("/sourcing");
    expect(revalidatePath).toHaveBeenCalledWith("/admin/users");
    expect(revalidatePath).toHaveBeenCalledWith("/admin/suppliers");
  });

  it("rejects when supplier already has active membership", async () => {
    vi.mocked(createAdminClient).mockReturnValue(buildAdminSupabaseMock(1));

    const result = await provisionSupplierUser(
      supplierId,
      "supplier@example.com",
      "password123",
    );

    expect(result).toEqual({
      ok: false,
      error: "У поставщика уже есть активный пользователь.",
    });
    expect(createAuthUserWithProfile).not.toHaveBeenCalled();
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SRC-710 / F012 supplier-org server actions.
 *
 * Regression checklist (manual + related unit tests):
 * - F010 sourcing: createSourcingSupplier, updateSupplierSourcingStatus, provisionSupplierUser — sourcing.test.ts
 * - F003 supplier portal: supplier role denied for org admin writes/reads here
 * - F004 pricing: price-compare.test.ts unchanged by org CRUD
 * - Migrations 018–022: supplier-org-migration.test.ts
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

import {
  createSupplierOrg,
  createSupplierWarehouse,
  deleteSupplierOrg,
  getSupplierOrg,
  listSuppliers,
  updateSupplierOrg,
} from "@/actions/supplier-org";
import { initialSupplierOrgState } from "@/actions/supplier-org-types";
import { getEffectiveProfile } from "@/lib/auth";
import { createClient } from "@/lib/app-client";
import { revalidatePath } from "next/cache";
import {
  DEFAULT_SOURCING_STATUS,
  deriveWorksInZapros,
} from "@/lib/sourcing";

const adminProfile = {
  id: "admin-id",
  role: "admin" as const,
  full_name: "Admin",
  supplier_id: null,
  is_active: true,
};

const seniorProfile = {
  id: "senior-id",
  role: "senior_procurement" as const,
  full_name: "Senior",
  supplier_id: null,
  is_active: true,
};

const procurementProfile = {
  id: "proc-id",
  role: "procurement" as const,
  full_name: "Proc",
  supplier_id: null,
  is_active: true,
};

const supplierProfile = {
  id: "supplier-user-id",
  role: "supplier" as const,
  full_name: "Supplier",
  supplier_id: "org-id",
  is_active: true,
};

type TableHandler = {
  selectData?: Record<string, unknown>[];
  maybeSingleData?: Record<string, unknown> | null;
  insertSingleData?: { id: string } | null;
  insertError?: { message: string } | null;
  updateError?: { message: string } | null;
  deleteError?: { message: string } | null;
  onInsert?: (payload: Record<string, unknown>) => void;
};

function buildQueryChain<T>(resolveValue: T) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  const self = () => chain;
  chain.in = vi.fn(self);
  chain.eq = vi.fn(self);
  chain.contains = vi.fn(self);
  chain.not = vi.fn(self);
  chain.order = vi.fn().mockResolvedValue(resolveValue);
  return chain;
}

function buildOrgSupabaseMock(tables: Record<string, TableHandler> = {}) {
  const handlerFor = (table: string): TableHandler =>
    tables[table] ?? { selectData: [] };

  const from = vi.fn((table: string) => {
    const h = handlerFor(table);

    const select = vi.fn(() => {
      if (h.maybeSingleData !== undefined) {
        return {
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: h.maybeSingleData,
              error: null,
            }),
          }),
        };
      }

      const listResult = {
        data: h.selectData ?? [],
        error: null,
      };

      const isJunctionTable =
        table === "supplier_categories" || table === "supplier_brands";
      if (isJunctionTable) {
        return { eq: vi.fn().mockResolvedValue(listResult) };
      }

      return buildQueryChain(listResult);
    });

    const insertSingle = vi.fn().mockResolvedValue({
      data: h.insertSingleData ?? { id: "new-supplier-id" },
      error: h.insertError ?? null,
    });
    const insertSelect = vi.fn().mockReturnValue({ single: insertSingle });
    const insert = vi.fn().mockImplementation((payload: Record<string, unknown>) => {
      h.onInsert?.(payload);
      return { select: insertSelect };
    });

    const updateEq = vi.fn().mockResolvedValue({
      error: h.updateError ?? null,
    });
    const update = vi.fn().mockReturnValue({ eq: updateEq });

    const deleteEq = vi.fn().mockResolvedValue({
      error: h.deleteError ?? null,
    });
    const deleteFn = vi.fn().mockReturnValue({ eq: deleteEq });

    return { select, insert, update, delete: deleteFn };
  });

  return { from };
}

describe("listSuppliers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("denies supplier role (F003 — portal user cannot list org admin data)", async () => {
    vi.mocked(getEffectiveProfile).mockResolvedValue(supplierProfile);

    const result = await listSuppliers();

    expect(result).toEqual({
      ok: false,
      error: "Недостаточно прав для просмотра.",
    });
    expect(createClient).not.toHaveBeenCalled();
  });

  it("allows procurement read (Option A) with empty list", async () => {
    vi.mocked(getEffectiveProfile).mockResolvedValue(procurementProfile);
    vi.mocked(createClient).mockResolvedValue(
      buildOrgSupabaseMock({
        suppliers: { selectData: [] },
      }),
    );

    const result = await listSuppliers();

    expect(result).toEqual({ ok: true, suppliers: [] });
  });
});

describe("createSupplierOrg", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getEffectiveProfile).mockResolvedValue(seniorProfile);
  });

  it("denies procurement write", async () => {
    vi.mocked(getEffectiveProfile).mockResolvedValue(procurementProfile);

    const formData = new FormData();
    formData.set("name", "ООО Тест");

    const result = await createSupplierOrg(initialSupplierOrgState, formData);

    expect(result).toEqual({
      error: "Недостаточно прав для выполнения операции.",
      ok: false,
    });
    expect(createClient).not.toHaveBeenCalled();
  });

  it("requires supplier name", async () => {
    const result = await createSupplierOrg(
      initialSupplierOrgState,
      new FormData(),
    );

    expect(result).toEqual({
      error: "Введите название поставщика.",
      ok: false,
    });
  });

  it("creates supplier with default sourcing fields and revalidates paths", async () => {
    let inserted: Record<string, unknown> | undefined;
    const supabase = buildOrgSupabaseMock({
      suppliers: {
        onInsert: (payload) => {
          inserted = payload;
        },
        insertSingleData: { id: "created-uuid" },
      },
      supplier_categories: { selectData: [] },
      supplier_brands: { selectData: [] },
    });
    vi.mocked(createClient).mockResolvedValue(supabase);

    const formData = new FormData();
    formData.set("name", "ООО Орг");
    formData.set("sourcing_status", DEFAULT_SOURCING_STATUS);
    formData.set("wave_priority", "normal");
    formData.append("region", "Москва");
    formData.append("region", "Тула");

    const result = await createSupplierOrg(initialSupplierOrgState, formData);

    expect(result).toEqual({
      error: null,
      ok: true,
      supplierId: "created-uuid",
    });
    expect(inserted).toMatchObject({
      name: "ООО Орг",
      sourcing_status: DEFAULT_SOURCING_STATUS,
      works_in_zapros: deriveWorksInZapros(DEFAULT_SOURCING_STATUS),
      wave_priority: "normal",
      regions: ["Москва", "Тула"],
    });
    expect(revalidatePath).toHaveBeenCalledWith("/admin/suppliers");
    expect(revalidatePath).toHaveBeenCalledWith("/sourcing");
    expect(revalidatePath).toHaveBeenCalledWith(
      "/admin/suppliers/created-uuid",
    );
  });

  it("rejects invalid payment_deferral_days", async () => {
    const formData = new FormData();
    formData.set("name", "ООО Тест");
    formData.set("payment_deferral_days", "1.5");

    const result = await createSupplierOrg(initialSupplierOrgState, formData);

    expect(result).toEqual({
      error: "Укажите целое неотрицательное число.",
      ok: false,
    });
    expect(createClient).not.toHaveBeenCalled();
  });
});

describe("updateSupplierOrg", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getEffectiveProfile).mockResolvedValue(seniorProfile);
  });

  it("requires id and name", async () => {
    const formData = new FormData();
    formData.set("id", "existing-id");

    const result = await updateSupplierOrg(initialSupplierOrgState, formData);

    expect(result).toEqual({
      error: "Введите название поставщика.",
      ok: false,
    });
  });
});

describe("deleteSupplierOrg", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("denies senior_procurement (admin-only hard delete)", async () => {
    vi.mocked(getEffectiveProfile).mockResolvedValue(seniorProfile);

    const formData = new FormData();
    formData.set("id", "supplier-uuid");

    const result = await deleteSupplierOrg(initialSupplierOrgState, formData);

    expect(result).toEqual({
      error: "Недостаточно прав для выполнения операции.",
      ok: false,
    });
    expect(createClient).not.toHaveBeenCalled();
  });

  it("allows admin delete and revalidates admin/groups", async () => {
    vi.mocked(getEffectiveProfile).mockResolvedValue(adminProfile);
    vi.mocked(createClient).mockResolvedValue(buildOrgSupabaseMock());

    const formData = new FormData();
    formData.set("id", "supplier-uuid");

    const result = await deleteSupplierOrg(initialSupplierOrgState, formData);

    expect(result).toEqual({ error: null, ok: true });
    expect(revalidatePath).toHaveBeenCalledWith("/admin/groups");
  });
});

describe("getSupplierOrg", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getEffectiveProfile).mockResolvedValue(procurementProfile);
  });

  it("rejects empty supplier id before querying", async () => {
    const result = await getSupplierOrg("");

    expect(result).toEqual({ ok: false, error: "Поставщик не найден." });
    expect(createClient).not.toHaveBeenCalled();
  });
});

describe("createSupplierWarehouse", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getEffectiveProfile).mockResolvedValue(seniorProfile);
  });

  it("requires site name", async () => {
    const formData = new FormData();
    formData.set("supplierId", "org-id");

    const result = await createSupplierWarehouse(
      initialSupplierOrgState,
      formData,
    );

    expect(result).toEqual({
      error: "Введите название.",
      ok: false,
    });
    expect(createClient).not.toHaveBeenCalled();
  });
});

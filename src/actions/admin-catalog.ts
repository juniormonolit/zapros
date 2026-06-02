"use server";

import { revalidatePath } from "next/cache";

import { getProfile } from "@/lib/auth";
import {
  DEFAULT_SOURCING_STATUS,
  deriveWorksInZapros,
  isSourcingStatus,
  type SourcingStatus,
} from "@/lib/sourcing";
import { createClient } from "@/lib/supabase/server";

import type { CatalogActionState } from "@/actions/admin-catalog-types";

/** Postgres unique-violation error code, surfaced via PostgREST. */
const UNIQUE_VIOLATION = "23505";

/** Placeholder a Bitrix URL template must contain to be usable by the parser. */
const TASK_ID_PLACEHOLDER = "{task_id}";

function ok(): CatalogActionState {
  return { error: null, ok: true };
}

function fail(message: string): CatalogActionState {
  return { error: message, ok: false };
}

/**
 * Authorization guard duplicating the database RLS check at the app layer
 * (defense in depth): mutations are only allowed for an authenticated admin.
 * Returns an error state to short-circuit the action, or `null` when allowed.
 */
async function denyNonAdmin(): Promise<CatalogActionState | null> {
  const profile = await getProfile();
  if (!profile || profile.role !== "admin") {
    return fail("Недостаточно прав для выполнения операции.");
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/* Suppliers                                                                   */
/* -------------------------------------------------------------------------- */

/** Trims an optional text field, collapsing blank input to `null`. */
function emptyToNull(raw: FormDataEntryValue | null): string | null {
  const value = String(raw ?? "").trim();
  return value === "" ? null : value;
}

/**
 * Validated supplier contact + sourcing payload, ready to be written to the
 * row. `works_in_zapros` is always derived from `sourcing_status` here, so the
 * flag can never be persisted out of sync with the stage.
 */
interface SupplierFields {
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
  sourcing_status: SourcingStatus;
  works_in_zapros: boolean;
}

/**
 * Reads the optional contact fields and the sourcing stage from a supplier
 * form. Contact fields are soft-validated (blank → `null`); the stage must be a
 * known enum value. Returns an error state when the stage is invalid, otherwise
 * the row payload with `works_in_zapros` derived from the stage.
 */
function readSupplierFields(
  formData: FormData,
): { error: CatalogActionState } | SupplierFields {
  const status = String(
    formData.get("sourcing_status") ?? DEFAULT_SOURCING_STATUS,
  ).trim();
  if (!isSourcingStatus(status)) {
    return { error: fail("Выберите корректную стадию поставщика.") };
  }

  return {
    contact_person: emptyToNull(formData.get("contact_person")),
    phone: emptyToNull(formData.get("phone")),
    email: emptyToNull(formData.get("email")),
    notes: emptyToNull(formData.get("notes")),
    sourcing_status: status,
    works_in_zapros: deriveWorksInZapros(status),
  };
}

export async function createSupplier(
  _prev: CatalogActionState,
  formData: FormData,
): Promise<CatalogActionState> {
  const denied = await denyNonAdmin();
  if (denied) return denied;

  const name = String(formData.get("name") ?? "").trim();
  if (!name) {
    return fail("Введите название поставщика.");
  }

  const fields = readSupplierFields(formData);
  if ("error" in fields) return fields.error;

  const supabase = await createClient();
  const { error } = await supabase
    .from("suppliers")
    .insert({ name, ...fields });
  if (error) {
    return fail("Не удалось создать поставщика.");
  }

  revalidatePath("/admin/suppliers");
  return ok();
}

export async function updateSupplier(
  _prev: CatalogActionState,
  formData: FormData,
): Promise<CatalogActionState> {
  const denied = await denyNonAdmin();
  if (denied) return denied;

  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!id) return fail("Поставщик не найден.");
  if (!name) return fail("Введите название поставщика.");

  const fields = readSupplierFields(formData);
  if ("error" in fields) return fields.error;

  const supabase = await createClient();
  const { error } = await supabase
    .from("suppliers")
    .update({ name, ...fields })
    .eq("id", id);
  if (error) {
    return fail("Не удалось сохранить изменения.");
  }

  revalidatePath("/admin/suppliers");
  return ok();
}

/**
 * Toggles a supplier's `is_active` flag. Deactivation is preferred over
 * deletion so historical references stay intact; `deleteSupplier` exists for
 * truly erroneous rows.
 */
export async function setSupplierActive(
  _prev: CatalogActionState,
  formData: FormData,
): Promise<CatalogActionState> {
  const denied = await denyNonAdmin();
  if (denied) return denied;

  const id = String(formData.get("id") ?? "");
  const isActive = String(formData.get("is_active") ?? "") === "true";
  if (!id) return fail("Поставщик не найден.");

  const supabase = await createClient();
  const { error } = await supabase
    .from("suppliers")
    .update({ is_active: isActive })
    .eq("id", id);
  if (error) {
    return fail("Не удалось изменить статус поставщика.");
  }

  revalidatePath("/admin/suppliers");
  return ok();
}

export async function deleteSupplier(
  _prev: CatalogActionState,
  formData: FormData,
): Promise<CatalogActionState> {
  const denied = await denyNonAdmin();
  if (denied) return denied;

  const id = String(formData.get("id") ?? "");
  if (!id) return fail("Поставщик не найден.");

  const supabase = await createClient();
  const { error } = await supabase.from("suppliers").delete().eq("id", id);
  if (error) {
    return fail("Не удалось удалить поставщика.");
  }

  revalidatePath("/admin/suppliers");
  revalidatePath("/admin/groups");
  return ok();
}

/* -------------------------------------------------------------------------- */
/* Supplier groups                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Parses the `sort_order` field, defaulting to 0 when blank and rejecting
 * values that are not non-negative integers.
 */
function parseSortOrder(raw: FormDataEntryValue | null): number | null {
  const value = String(raw ?? "").trim();
  if (value === "") return 0;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) return null;
  return parsed;
}

export async function createGroup(
  _prev: CatalogActionState,
  formData: FormData,
): Promise<CatalogActionState> {
  const denied = await denyNonAdmin();
  if (denied) return denied;

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return fail("Введите название группы.");

  const sortOrder = parseSortOrder(formData.get("sort_order"));
  if (sortOrder === null) {
    return fail("Порядок должен быть целым неотрицательным числом.");
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("supplier_groups")
    .insert({ name, sort_order: sortOrder });
  if (error) {
    return fail("Не удалось создать группу.");
  }

  revalidatePath("/admin/groups");
  return ok();
}

export async function updateGroup(
  _prev: CatalogActionState,
  formData: FormData,
): Promise<CatalogActionState> {
  const denied = await denyNonAdmin();
  if (denied) return denied;

  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!id) return fail("Группа не найдена.");
  if (!name) return fail("Введите название группы.");

  const sortOrder = parseSortOrder(formData.get("sort_order"));
  if (sortOrder === null) {
    return fail("Порядок должен быть целым неотрицательным числом.");
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("supplier_groups")
    .update({ name, sort_order: sortOrder })
    .eq("id", id);
  if (error) {
    return fail("Не удалось сохранить изменения.");
  }

  revalidatePath("/admin/groups");
  return ok();
}

export async function deleteGroup(
  _prev: CatalogActionState,
  formData: FormData,
): Promise<CatalogActionState> {
  const denied = await denyNonAdmin();
  if (denied) return denied;

  const id = String(formData.get("id") ?? "");
  if (!id) return fail("Группа не найдена.");

  const supabase = await createClient();
  const { error } = await supabase
    .from("supplier_groups")
    .delete()
    .eq("id", id);
  if (error) {
    return fail("Не удалось удалить группу.");
  }

  revalidatePath("/admin/groups");
  return ok();
}

/* -------------------------------------------------------------------------- */
/* Membership (many-to-many)                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Replaces the membership of a group with the submitted set of suppliers.
 *
 * The checkbox list submits zero or more `supplierId` values. We diff against
 * the current rows so only real changes touch the table: removed suppliers are
 * deleted and newly checked ones inserted. This keeps the `UNIQUE(supplier_id,
 * group_id)` constraint satisfied without churning unchanged rows.
 */
export async function setGroupMembers(
  _prev: CatalogActionState,
  formData: FormData,
): Promise<CatalogActionState> {
  const denied = await denyNonAdmin();
  if (denied) return denied;

  const groupId = String(formData.get("groupId") ?? "");
  if (!groupId) return fail("Группа не найдена.");

  const selected = new Set(
    formData.getAll("supplierId").map((value) => String(value)),
  );

  const supabase = await createClient();

  const { data: current, error: readError } = await supabase
    .from("supplier_group_members")
    .select("supplier_id")
    .eq("group_id", groupId);
  if (readError) {
    return fail("Не удалось загрузить текущий состав группы.");
  }

  const existing = new Set(
    (current ?? []).map((row) => String(row.supplier_id)),
  );

  const toAdd = [...selected].filter((id) => !existing.has(id));
  const toRemove = [...existing].filter((id) => !selected.has(id));

  if (toRemove.length > 0) {
    const { error } = await supabase
      .from("supplier_group_members")
      .delete()
      .eq("group_id", groupId)
      .in("supplier_id", toRemove);
    if (error) {
      return fail("Не удалось обновить состав группы.");
    }
  }

  if (toAdd.length > 0) {
    const { error } = await supabase.from("supplier_group_members").insert(
      toAdd.map((supplierId) => ({
        group_id: groupId,
        supplier_id: supplierId,
      })),
    );
    if (error) {
      return fail("Не удалось обновить состав группы.");
    }
  }

  revalidatePath("/admin/groups");
  return ok();
}

/* -------------------------------------------------------------------------- */
/* Bitrix group settings                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Validates the shared Bitrix fields (`name`, `url_template`). Returns an error
 * state when invalid, or the trimmed values when valid.
 */
function readBitrixFields(
  formData: FormData,
):
  | { error: CatalogActionState }
  | { name: string; urlTemplate: string; isActive: boolean } {
  const name = String(formData.get("name") ?? "").trim();
  const urlTemplate = String(formData.get("url_template") ?? "").trim();
  const isActive = formData.get("is_active") !== null;

  if (!name) {
    return { error: fail("Введите название группы Bitrix.") };
  }
  if (!urlTemplate) {
    return { error: fail("Введите URL-шаблон.") };
  }
  if (!urlTemplate.includes(TASK_ID_PLACEHOLDER)) {
    return {
      error: fail(`URL-шаблон должен содержать плейсхолдер ${TASK_ID_PLACEHOLDER}.`),
    };
  }

  return { name, urlTemplate, isActive };
}

export async function createBitrixSetting(
  _prev: CatalogActionState,
  formData: FormData,
): Promise<CatalogActionState> {
  const denied = await denyNonAdmin();
  if (denied) return denied;

  const fields = readBitrixFields(formData);
  if ("error" in fields) return fields.error;

  const supabase = await createClient();
  const { error } = await supabase.from("bitrix_group_settings").insert({
    name: fields.name,
    url_template: fields.urlTemplate,
    is_active: fields.isActive,
  });
  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      return fail("Группа Bitrix с таким названием уже существует.");
    }
    return fail("Не удалось создать настройку Bitrix.");
  }

  revalidatePath("/admin/bitrix");
  return ok();
}

export async function updateBitrixSetting(
  _prev: CatalogActionState,
  formData: FormData,
): Promise<CatalogActionState> {
  const denied = await denyNonAdmin();
  if (denied) return denied;

  const id = String(formData.get("id") ?? "");
  if (!id) return fail("Настройка не найдена.");

  const fields = readBitrixFields(formData);
  if ("error" in fields) return fields.error;

  const supabase = await createClient();
  const { error } = await supabase
    .from("bitrix_group_settings")
    .update({
      name: fields.name,
      url_template: fields.urlTemplate,
      is_active: fields.isActive,
    })
    .eq("id", id);
  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      return fail("Группа Bitrix с таким названием уже существует.");
    }
    return fail("Не удалось сохранить изменения.");
  }

  revalidatePath("/admin/bitrix");
  return ok();
}

export async function deleteBitrixSetting(
  _prev: CatalogActionState,
  formData: FormData,
): Promise<CatalogActionState> {
  const denied = await denyNonAdmin();
  if (denied) return denied;

  const id = String(formData.get("id") ?? "");
  if (!id) return fail("Настройка не найдена.");

  const supabase = await createClient();
  const { error } = await supabase
    .from("bitrix_group_settings")
    .delete()
    .eq("id", id);
  if (error) {
    return fail("Не удалось удалить настройку Bitrix.");
  }

  revalidatePath("/admin/bitrix");
  return ok();
}

/* -------------------------------------------------------------------------- */
/* App settings                                                                */
/* -------------------------------------------------------------------------- */

/** Maximum accepted cash→non-cash ratio (a coefficient in the (0, 1] range). */
const MAX_RATIO = 1;

export async function updateAppSettings(
  _prev: CatalogActionState,
  formData: FormData,
): Promise<CatalogActionState> {
  const denied = await denyNonAdmin();
  if (denied) return denied;

  const deadlineRaw = String(formData.get("response_deadline_days") ?? "").trim();
  const ratioRaw = String(formData.get("cash_to_noncash_ratio") ?? "").trim();

  const deadlineDays = Number(deadlineRaw);
  if (!Number.isInteger(deadlineDays) || deadlineDays <= 0) {
    return fail("Срок ответа должен быть целым положительным числом дней.");
  }

  const ratio = Number(ratioRaw);
  if (!Number.isFinite(ratio) || ratio <= 0 || ratio > MAX_RATIO) {
    return fail("Коэффициент должен быть числом в диапазоне (0; 1].");
  }

  const supabase = await createClient();
  const updatedAt = new Date().toISOString();
  const { error } = await supabase.from("app_settings").upsert(
    [
      {
        key: "response_deadline_days",
        value: String(deadlineDays),
        updated_at: updatedAt,
      },
      {
        key: "cash_to_noncash_ratio",
        value: String(ratio),
        updated_at: updatedAt,
      },
    ],
    { onConflict: "key" },
  );
  if (error) {
    return fail("Не удалось сохранить настройки.");
  }

  revalidatePath("/admin/settings");
  return ok();
}

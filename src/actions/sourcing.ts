"use server";

import "server-only";

import { revalidatePath } from "next/cache";

import type {
  ProvisionAndMoveResult,
  ProvisionSupplierUserResult,
  SourcingActionState,
  UpdateSupplierSourcingStatusResult,
} from "@/actions/sourcing-types";
import { getEffectiveProfile } from "@/lib/auth";
import { createAuthUserWithProfile } from "@/lib/auth/provision-user.server";
import { emailExists } from "@/lib/auth/users.server";
import { createClient } from "@/lib/app-client";
import { createAdminClient } from "@/lib/admin-client";
import { ensureRow } from "@/lib/db/types";
import { isSourcingTransitionAllowed } from "@/lib/sourcing-kanban-config";
import {
  DEFAULT_SOURCING_STATUS,
  WORKING_IN_ZAPROS_STATUS,
  deriveWorksInZapros,
  isSourcingStatus,
  type SourcingStatus,
} from "@/lib/sourcing";

const SOURCING_PATH = "/sourcing";
const ADMIN_USERS_PATH = "/admin/users";
const ADMIN_SUPPLIERS_PATH = "/admin/suppliers";
const MIN_PASSWORD_LENGTH = 8;

const NEEDS_EMAIL_MESSAGE =
  "Укажите email на карточке поставщика перед переходом на стадию «Работает в Zapros».";

function sourcingOk(): SourcingActionState {
  return { error: null, ok: true };
}

function sourcingFail(message: string): SourcingActionState {
  return { error: message, ok: false };
}

function statusFail(message: string): UpdateSupplierSourcingStatusResult {
  return { ok: false, error: message };
}

function provisionFail(message: string): ProvisionSupplierUserResult {
  return { ok: false, error: message };
}

/**
 * Effective role must be senior_procurement or admin (view-as included).
 * Returns an error message when denied, or `null` when allowed.
 */
async function denyNonSeniorOrAdmin(): Promise<string | null> {
  const profile = await getEffectiveProfile();
  if (!profile) {
    return "Необходима авторизация.";
  }
  if (
    profile.role !== "senior_procurement" &&
    profile.role !== "admin"
  ) {
    return "Недостаточно прав для выполнения операции.";
  }
  return null;
}

function emptyToNull(raw: FormDataEntryValue | null): string | null {
  const value = String(raw ?? "").trim();
  return value === "" ? null : value;
}

async function hasActiveSupplierUser(supplierId: string): Promise<boolean> {
  const admin = createAdminClient();
  const { count, error } = await admin
    .from("supplier_members")
    .select("id", { count: "exact", head: true })
    .eq("supplier_id", supplierId)
    .eq("is_active", true);

  // Fail closed: treat lookup errors as "no active user" (block transition).
  if (error) {
    return false;
  }
  return (count ?? 0) > 0;
}

async function applySupplierStatusUpdate(
  supplierId: string,
  targetStatus: SourcingStatus,
): Promise<UpdateSupplierSourcingStatusResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("suppliers")
    .update({
      sourcing_status: targetStatus,
      works_in_zapros: deriveWorksInZapros(targetStatus),
    })
    .eq("id", supplierId);

  if (error) {
    return statusFail("Не удалось обновить стадию поставщика.");
  }

  revalidatePath(SOURCING_PATH);
  revalidatePath(ADMIN_SUPPLIERS_PATH);
  return { ok: true };
}

export async function updateSupplierSourcingStatus(
  supplierId: string,
  targetStatus: string,
): Promise<UpdateSupplierSourcingStatusResult> {
  const denied = await denyNonSeniorOrAdmin();
  if (denied) return statusFail(denied);

  if (!supplierId) {
    return statusFail("Поставщик не найден.");
  }
  if (!isSourcingStatus(targetStatus)) {
    return statusFail("Некорректная стадия поставщика.");
  }

  const supabase = await createClient();
  const { data, error: readError } = await supabase
    .from("suppliers")
    .select("id, sourcing_status, email")
    .eq("id", supplierId)
    .maybeSingle();

  const supplier = ensureRow(data);
  if (readError || !supplier) {
    return statusFail("Поставщик не найден или нет доступа.");
  }

  const currentStatus = String(supplier.sourcing_status);
  if (!isSourcingStatus(currentStatus)) {
    return statusFail("Некорректная текущая стадия поставщика.");
  }

  if (currentStatus === targetStatus) {
    return { ok: true };
  }

  if (!isSourcingTransitionAllowed(currentStatus, targetStatus)) {
    return statusFail("Недопустимый переход стадии для этого поставщика.");
  }

  if (targetStatus === WORKING_IN_ZAPROS_STATUS) {
    const hasUser = await hasActiveSupplierUser(supplierId);
    if (!hasUser) {
      const email = String(supplier.email ?? "").trim();
      if (!email) {
        return statusFail(NEEDS_EMAIL_MESSAGE);
      }
      return { ok: false, needsProvision: true };
    }
  }

  return applySupplierStatusUpdate(supplierId, targetStatus);
}

export async function createSourcingSupplier(
  _prev: SourcingActionState,
  formData: FormData,
): Promise<SourcingActionState> {
  const denied = await denyNonSeniorOrAdmin();
  if (denied) return sourcingFail(denied);

  const name = String(formData.get("name") ?? "").trim();
  if (!name) {
    return sourcingFail("Введите название поставщика.");
  }

  const supabase = await createClient();
  const { error } = await supabase.from("suppliers").insert({
    name,
    contact_person: emptyToNull(formData.get("contact_person")),
    phone: emptyToNull(formData.get("phone")),
    email: emptyToNull(formData.get("email")),
    sourcing_status: DEFAULT_SOURCING_STATUS,
    works_in_zapros: deriveWorksInZapros(DEFAULT_SOURCING_STATUS),
  });

  if (error) {
    return sourcingFail("Не удалось создать поставщика.");
  }

  revalidatePath(SOURCING_PATH);
  revalidatePath(ADMIN_SUPPLIERS_PATH);
  return sourcingOk();
}

export async function provisionSupplierUser(
  supplierId: string,
  email: string,
  password: string,
): Promise<ProvisionSupplierUserResult> {
  const denied = await denyNonSeniorOrAdmin();
  if (denied) return provisionFail(denied);

  if (!supplierId) {
    return provisionFail("Поставщик не найден.");
  }

  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) {
    return provisionFail("Введите email.");
  }
  if (!password || password.length < MIN_PASSWORD_LENGTH) {
    return provisionFail(
      `Пароль обязателен (минимум ${MIN_PASSWORD_LENGTH} символов).`,
    );
  }

  if (await hasActiveSupplierUser(supplierId)) {
    return provisionFail("У поставщика уже есть активный пользователь.");
  }

  if (await emailExists(normalizedEmail)) {
    return provisionFail("Пользователь с таким email уже существует.");
  }

  const supabase = await createClient();
  const { data, error: readError } = await supabase
    .from("suppliers")
    .select("id, name")
    .eq("id", supplierId)
    .maybeSingle();

  const supplier = ensureRow(data);
  if (readError || !supplier) {
    return provisionFail("Поставщик не найден или нет доступа.");
  }

  const created = await createAuthUserWithProfile({
    email: normalizedEmail,
    password,
    role: "supplier",
    fullName: String(supplier.name ?? "").trim() || null,
    supplierId,
  });

  if (!created.ok) {
    return provisionFail(created.error);
  }

  revalidatePath(SOURCING_PATH);
  revalidatePath(ADMIN_USERS_PATH);
  revalidatePath(ADMIN_SUPPLIERS_PATH);

  return { ok: true, userId: created.userId };
}

/**
 * Provisions a supplier login, then moves the card to `working_in_zapros`.
 * Use when the kanban blocked with `needsProvision` after drag.
 */
export async function provisionAndMoveToWorkingInZapros(
  supplierId: string,
  email: string,
  password: string,
): Promise<ProvisionAndMoveResult> {
  const provisioned = await provisionSupplierUser(
    supplierId,
    email,
    password,
  );
  if (!provisioned.ok) {
    return { ok: false, error: provisioned.error };
  }

  const moved = await updateSupplierSourcingStatus(
    supplierId,
    WORKING_IN_ZAPROS_STATUS,
  );
  if (!moved.ok) {
    if ("needsProvision" in moved) {
      return {
        ok: false,
        error: "Пользователь создан, но не удалось перевести поставщика на стадию «Работает в Zapros».",
      };
    }
    return { ok: false, error: moved.error };
  }

  return { ok: true };
}

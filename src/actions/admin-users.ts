"use server";

import "server-only";

import { revalidatePath } from "next/cache";

import { getProfile, type UserRole } from "@/lib/auth";
import { createAuthUserWithProfile } from "@/lib/auth/provision-user.server";
import { emailExists, listAuthUsers } from "@/lib/auth/users.server";
import { ensureRows } from "@/lib/db/types";
import { createAdminClient } from "@/lib/admin-client";

const ADMIN_USERS_PATH = "/admin/users";
const VALID_ROLES: readonly UserRole[] = [
  "admin",
  "senior_procurement",
  "procurement",
  "supplier",
];
const MIN_PASSWORD_LENGTH = 8;

export interface AdminUserRow {
  id: string;
  email: string | null;
  role: UserRole;
  full_name: string | null;
  supplier_id: string | null;
  supplier_name: string | null;
  is_active: boolean;
}

export interface SupplierOption {
  id: string;
  name: string;
}

export interface CreateUserState {
  error: string | null;
  success: string | null;
}

const SINGLE_ADMIN_MESSAGE =
  "Администратор уже существует. В системе допускается только один администратор.";

async function isCallerAdmin(): Promise<boolean> {
  const profile = await getProfile();
  return profile?.role === "admin";
}

function fail(error: string): CreateUserState {
  return { error, success: null };
}

export async function listUsers(): Promise<AdminUserRow[]> {
  if (!(await isCallerAdmin())) {
    throw new Error("Доступ запрещён.");
  }

  const admin = createAdminClient();

  const { data: profilesData, error } = await admin
    .from("profiles")
    .select("id, role, full_name, supplier_id, is_active")
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error("Не удалось загрузить список пользователей.");
  }

  const profiles = ensureRows(profilesData);

  const supplierIds = [
    ...new Set(
      profiles
        .map((row) => row.supplier_id)
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    ),
  ];

  const supplierNameById = new Map<string, string>();
  if (supplierIds.length > 0) {
    const { data: suppliersData, error: suppliersError } = await admin
      .from("suppliers")
      .select("id, name")
      .in("id", supplierIds);
    if (suppliersError) {
      throw new Error("Не удалось загрузить поставщиков.");
    }
    for (const s of ensureRows(suppliersData)) {
      supplierNameById.set(String(s.id), String(s.name));
    }
  }

  const emailById = new Map(
    (await listAuthUsers()).map((user) => [user.id, user.email]),
  );

  return profiles.map((row) => {
    const supplierId =
      typeof row.supplier_id === "string" ? row.supplier_id : null;
    return {
      id: String(row.id),
      email: emailById.get(String(row.id)) ?? null,
      role: row.role as UserRole,
      full_name: row.full_name as string | null,
      supplier_id: supplierId,
      supplier_name: supplierId
        ? (supplierNameById.get(supplierId) ?? null)
        : null,
      is_active: Boolean(row.is_active),
    };
  });
}

export async function listSuppliers(): Promise<SupplierOption[]> {
  if (!(await isCallerAdmin())) {
    throw new Error("Доступ запрещён.");
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("suppliers")
    .select("id, name")
    .eq("is_active", true)
    .order("name", { ascending: true });

  if (error) {
    throw new Error("Не удалось загрузить список поставщиков.");
  }

  return ensureRows(data).map((row) => ({
    id: String(row.id),
    name: String(row.name),
  }));
}

export async function createUser(
  _prevState: CreateUserState,
  formData: FormData,
): Promise<CreateUserState> {
  if (!(await isCallerAdmin())) {
    return fail("Доступ запрещён.");
  }

  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const fullName = String(formData.get("full_name") ?? "").trim();
  const role = String(formData.get("role") ?? "") as UserRole;
  const password = String(formData.get("password") ?? "");
  const rawSupplierId = String(formData.get("supplier_id") ?? "").trim();

  if (!email) {
    return fail("Введите email.");
  }
  if (!VALID_ROLES.includes(role)) {
    return fail("Выберите роль.");
  }

  const supplierId = role === "supplier" ? rawSupplierId || null : null;
  if (role === "supplier" && !supplierId) {
    return fail("Для роли «поставщик» необходимо выбрать поставщика.");
  }

  if (!password || password.length < MIN_PASSWORD_LENGTH) {
    return fail(`Пароль обязателен (минимум ${MIN_PASSWORD_LENGTH} символов).`);
  }

  if (await emailExists(email)) {
    return fail("Пользователь с таким email уже существует.");
  }

  const admin = createAdminClient();

  if (role === "admin") {
    const { count } = await admin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("role", "admin");

    if ((count ?? 0) > 0) {
      return fail(SINGLE_ADMIN_MESSAGE);
    }
  }

  const created = await createAuthUserWithProfile({
    email,
    password,
    role,
    fullName: fullName || null,
    supplierId,
  });

  if (!created.ok) {
    if (role === "admin" && created.code === "23505") {
      return fail(SINGLE_ADMIN_MESSAGE);
    }
    return fail(created.error);
  }

  revalidatePath(ADMIN_USERS_PATH);

  return { error: null, success: `Пользователь ${email} создан.` };
}

export async function setUserActive(
  profileId: string,
  isActive: boolean,
): Promise<void> {
  const profile = await getProfile();
  if (profile?.role !== "admin") {
    return;
  }
  if (!profileId || profileId === profile.id) {
    return;
  }

  const admin = createAdminClient();
  await admin
    .from("profiles")
    .update({ is_active: isActive })
    .eq("id", profileId);

  revalidatePath(ADMIN_USERS_PATH);
}

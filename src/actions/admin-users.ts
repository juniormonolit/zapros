"use server";

import "server-only";

import { revalidatePath } from "next/cache";

import { getProfile, type UserRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

const ADMIN_USERS_PATH = "/admin/users";
const VALID_ROLES: readonly UserRole[] = [
  "admin",
  "senior_procurement",
  "procurement",
  "supplier",
];
const MIN_PASSWORD_LENGTH = 8;

/** A single row rendered in the admin users table. */
export interface AdminUserRow {
  id: string;
  email: string | null;
  role: UserRole;
  full_name: string | null;
  supplier_id: string | null;
  supplier_name: string | null;
  is_active: boolean;
}

/** Supplier option for the role=supplier select. */
export interface SupplierOption {
  id: string;
  name: string;
}

/**
 * State returned by {@link createUser} for `useActionState`. Exactly one of
 * `error` / `success` is non-null after a submission.
 */
export interface CreateUserState {
  error: string | null;
  success: string | null;
}

/** Friendly message shown whenever a second admin is attempted. */
const SINGLE_ADMIN_MESSAGE =
  "Администратор уже существует. В системе допускается только один администратор.";

/**
 * Returns true when the caller is an authenticated admin. Authorization is
 * re-checked on the server for every privileged action (defence in depth on top
 * of the route middleware).
 */
async function isCallerAdmin(): Promise<boolean> {
  const profile = await getProfile();
  return profile?.role === "admin";
}

/** Helper to build a failed {@link CreateUserState}. */
function fail(error: string): CreateUserState {
  return { error, success: null };
}

/**
 * Lists every profile with its email (resolved from `auth.users`), role,
 * linked supplier and active flag. Admin-only.
 */
export async function listUsers(): Promise<AdminUserRow[]> {
  if (!(await isCallerAdmin())) {
    throw new Error("Доступ запрещён.");
  }

  const admin = createAdminClient();

  const { data: profiles, error } = await admin
    .from("profiles")
    .select(
      "id, role, full_name, supplier_id, is_active, suppliers!profiles_supplier_id_fkey(name)",
    )
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error("Не удалось загрузить список пользователей.");
  }

  // Emails live in auth.users, not in profiles; resolve them via the admin API.
  const { data: authList, error: authError } =
    await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });

  if (authError) {
    throw new Error("Не удалось загрузить данные аутентификации.");
  }

  const emailById = new Map(
    authList.users.map((user) => [user.id, user.email ?? null]),
  );

  return (profiles ?? []).map((row) => {
    // Supabase infers the embedded to-one relation as an array; at runtime it
    // is a single object (or null). Normalize both shapes defensively.
    const rawSupplier = row.suppliers as
      | { name: string }
      | { name: string }[]
      | null;
    const supplier = Array.isArray(rawSupplier) ? rawSupplier[0] : rawSupplier;
    return {
      id: row.id,
      email: emailById.get(row.id) ?? null,
      role: row.role as UserRole,
      full_name: row.full_name,
      supplier_id: row.supplier_id,
      supplier_name: supplier?.name ?? null,
      is_active: row.is_active,
    };
  });
}

/** Lists active suppliers for the create-user form select. Admin-only. */
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

  return (data ?? []) as SupplierOption[];
}

/**
 * Creates an auth user and provisions their profile (role, name, supplier).
 *
 * Shaped for `useActionState`. Validation rules:
 * - email is required;
 * - role must be one of the known roles;
 * - role=supplier requires a supplier_id;
 * - only one admin may exist (checked here AND guarded by the `one_admin`
 *   partial unique index, whose 23505 error is also handled).
 *
 * If no password is provided an invite email is sent instead (passwordless).
 */
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

  // supplier_id only applies to suppliers; ignore it for other roles.
  const supplierId = role === "supplier" ? rawSupplierId || null : null;
  if (role === "supplier" && !supplierId) {
    return fail("Для роли «поставщик» необходимо выбрать поставщика.");
  }

  if (password && password.length < MIN_PASSWORD_LENGTH) {
    return fail(`Пароль должен содержать минимум ${MIN_PASSWORD_LENGTH} символов.`);
  }

  const admin = createAdminClient();

  // Application-level single-admin guard with a clear message; the DB index is
  // the backstop against races.
  if (role === "admin") {
    const { count } = await admin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("role", "admin");

    if ((count ?? 0) > 0) {
      return fail(SINGLE_ADMIN_MESSAGE);
    }
  }

  // Create the auth user. With a password we confirm the email immediately so
  // the account can log in right away; without one we send an invite email.
  const { data: createdData, error: createError } = password
    ? await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      })
    : await admin.auth.admin.inviteUserByEmail(email);

  if (createError || !createdData.user) {
    const message = createError?.message ?? "";
    if (/already|exists|registered/i.test(message)) {
      return fail("Пользователь с таким email уже существует.");
    }
    return fail("Не удалось создать пользователя.");
  }

  const userId = createdData.user.id;

  // The handle_new_user trigger inserts a default profile row; upsert promotes
  // it with the chosen role/name/supplier. onConflict=id keeps it idempotent.
  const { error: profileError } = await admin
    .from("profiles")
    .upsert(
      {
        id: userId,
        role,
        full_name: fullName || null,
        supplier_id: supplierId,
      },
      { onConflict: "id" },
    );

  if (profileError) {
    // Roll back the orphaned auth user so a retry can succeed cleanly.
    await admin.auth.admin.deleteUser(userId);

    if (profileError.code === "23505") {
      return fail(SINGLE_ADMIN_MESSAGE);
    }
    return fail("Не удалось сохранить профиль пользователя.");
  }

  revalidatePath(ADMIN_USERS_PATH);

  const action = password ? "создан" : "приглашён по email";
  return { error: null, success: `Пользователь ${email} ${action}.` };
}

/**
 * Enables or disables a user account (`profiles.is_active`). Admin-only.
 *
 * An admin cannot deactivate their own account, preventing accidental lockout
 * given the single-admin constraint. Bound to a form via `.bind`.
 */
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

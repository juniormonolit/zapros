"use server";

import "server-only";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

import { ROLE_LABELS } from "@/components/navigation/nav-config";
import { getProfile, type UserRole } from "@/lib/auth";
import { listAuthUsers } from "@/lib/auth/users.server";
import { createAdminClient } from "@/lib/admin-client";
import { ensureRow, ensureRows } from "@/lib/db/types";
import {
  VIEW_AS_COOKIE,
  VIEW_AS_COOKIE_OPTIONS,
  clearViewAsCookie,
  isAdminViewAsEnabled,
} from "@/lib/view-as";

export type ViewAsActionResult = { ok: true } | { ok: false; error: string };

const VIEW_AS_BOARD_PATHS = ["/sourcing", "/app", "/supplier"] as const;

function revalidateViewAsBoards(): void {
  for (const path of VIEW_AS_BOARD_PATHS) {
    revalidatePath(path);
  }
}

const VIEW_AS_ROLE_ORDER: readonly UserRole[] = [
  "admin",
  "senior_procurement",
  "procurement",
  "supplier",
];

export interface ViewAsUserOption {
  id: string;
  email: string | null;
  full_name: string | null;
  role: UserRole;
}

export interface ViewAsUsersGroup {
  role: UserRole;
  label: string;
  users: ViewAsUserOption[];
}

export async function listUsersForViewAs(): Promise<ViewAsUsersGroup[]> {
  if (!isAdminViewAsEnabled()) {
    return [];
  }

  const denied = await requireAdminSession();
  if (denied?.ok === false) {
    throw new Error(denied.error);
  }

  const admin = createAdminClient();
  const { data: profilesData, error } = await admin
    .from("profiles")
    .select("id, role, full_name, supplier_id, is_active")
    .eq("is_active", true)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error("Не удалось загрузить список пользователей.");
  }

  const emailById = new Map(
    (await listAuthUsers()).map((user) => [user.id, user.email]),
  );

  const usersByRole = new Map<UserRole, ViewAsUserOption[]>();
  for (const role of VIEW_AS_ROLE_ORDER) {
    usersByRole.set(role, []);
  }

  for (const row of ensureRows(profilesData)) {
    const role = row.role as UserRole;
    if (!VIEW_AS_ROLE_ORDER.includes(role)) continue;

    const supplierId =
      typeof row.supplier_id === "string" ? row.supplier_id : null;
    if (role === "supplier" && !supplierId) continue;

    const option: ViewAsUserOption = {
      id: String(row.id),
      email: emailById.get(String(row.id)) ?? null,
      full_name: row.full_name as string | null,
      role,
    };
    usersByRole.get(role)!.push(option);
  }

  return VIEW_AS_ROLE_ORDER.map((role) => ({
    role,
    label: ROLE_LABELS[role],
    users: usersByRole.get(role) ?? [],
  })).filter((group) => group.users.length > 0);
}

async function requireAdminSession(): Promise<ViewAsActionResult | null> {
  const profile = await getProfile();
  if (profile?.role !== "admin") {
    return { ok: false, error: "Доступ запрещён." };
  }
  return null;
}

export async function setViewAsUserId(
  userId: string,
): Promise<ViewAsActionResult> {
  if (!isAdminViewAsEnabled()) {
    return { ok: false, error: "Просмотр от лица отключён." };
  }

  const denied = await requireAdminSession();
  if (denied) return denied;

  const trimmed = userId.trim();
  if (!trimmed) {
    return { ok: false, error: "Пользователь не указан." };
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("profiles")
    .select("id, is_active, role, supplier_id")
    .eq("id", trimmed)
    .single();

  if (error || !ensureRow(data)) {
    return { ok: false, error: "Пользователь не найден." };
  }

  const row = ensureRow(data)!;
  if (!row.is_active) {
    return { ok: false, error: "Пользователь неактивен." };
  }

  if (row.role === "supplier") {
    const supplierId =
      typeof row.supplier_id === "string" ? row.supplier_id : null;
    if (!supplierId) {
      return {
        ok: false,
        error: "У поставщика не указана организация.",
      };
    }
  }

  const cookieStore = await cookies();
  cookieStore.set(VIEW_AS_COOKIE, trimmed, VIEW_AS_COOKIE_OPTIONS);
  revalidateViewAsBoards();

  return { ok: true };
}

export async function clearViewAsUserId(): Promise<ViewAsActionResult> {
  const denied = await requireAdminSession();
  if (denied) return denied;

  await clearViewAsCookie();
  revalidateViewAsBoards();

  return { ok: true };
}

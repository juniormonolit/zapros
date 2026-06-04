"use server";

import { redirect } from "next/navigation";

import {
  homeRouteForRole,
  PROFILE_COLUMNS,
  type UserRole,
} from "@/lib/auth";
import { setSessionCookie, clearSessionCookie } from "@/lib/auth/session.server";
import { clearViewAsCookie } from "@/lib/view-as";
import { findUserByEmail } from "@/lib/auth/users.server";
import { verifyPassword } from "@/lib/auth/password";
import { createDataClient } from "@/lib/db/client";
import { ensureRow } from "@/lib/db/types";

export interface SignInState {
  error: string | null;
}

export async function signIn(
  _prevState: SignInState,
  formData: FormData,
): Promise<SignInState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Введите email и пароль." };
  }

  let authUser;
  try {
    authUser = await findUserByEmail(email);
  } catch (err) {
    const code =
      err && typeof err === "object" && "code" in err
        ? String((err as { code: string }).code)
        : "";
    if (code === "ETIMEDOUT" || code === "ECONNREFUSED") {
      console.error("signIn: database unreachable", err);
      return {
        error:
          "Нет связи с базой данных. Проверьте DATABASE_URL в .env.local, перезапустите npm run dev и доступ к кластеру Yandex (белый список IP).",
      };
    }
    throw err;
  }

  if (!authUser?.encrypted_password) {
    return { error: "Неверный email или пароль." };
  }

  const valid = await verifyPassword(password, authUser.encrypted_password);
  if (!valid) {
    return { error: "Неверный email или пароль." };
  }

  const db = createDataClient(authUser.id);
  const { data: profile } = await db
    .from("profiles")
    .select(PROFILE_COLUMNS)
    .eq("id", authUser.id)
    .single();

  const profileRow = ensureRow(profile);
  if (!profileRow) {
    return { error: "Профиль недоступен. Обратитесь к администратору." };
  }

  if (!profileRow.is_active) {
    return { error: "Учётная запись деактивирована." };
  }

  await setSessionCookie(authUser.id, authUser.email);

  redirect(homeRouteForRole(profileRow.role as UserRole));
}

export async function signOut(): Promise<void> {
  await clearSessionCookie();
  await clearViewAsCookie();
  redirect("/login");
}

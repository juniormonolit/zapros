"use server";

import { redirect } from "next/navigation";

import { homeRouteForRole, PROFILE_COLUMNS, type UserRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/**
 * State returned by {@link signIn} to the login form. `error` holds a
 * user-facing, intentionally generic message; `null` means no error yet.
 */
export interface SignInState {
  error: string | null;
}

/**
 * Authenticates a user with email + password and redirects to the home route
 * for their role.
 *
 * Shaped for React's `useActionState`: it receives the previous state and the
 * submitted `FormData`. On failure it returns a generic message (we never leak
 * whether the email or the password was wrong). On success it never returns —
 * `redirect()` throws to navigate.
 *
 * Self-registration is intentionally not supported (see auth-rls.md); users are
 * provisioned by an admin.
 */
export async function signIn(
  _prevState: SignInState,
  formData: FormData,
): Promise<SignInState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Введите email и пароль." };
  }

  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    return { error: "Неверный email или пароль." };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Не удалось войти. Попробуйте ещё раз." };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select(PROFILE_COLUMNS)
    .eq("id", user.id)
    .single();

  if (!profile) {
    await supabase.auth.signOut();
    return { error: "Профиль недоступен. Обратитесь к администратору." };
  }

  if (!profile.is_active) {
    await supabase.auth.signOut();
    return { error: "Учётная запись деактивирована." };
  }

  // `redirect` throws NEXT_REDIRECT, so it must be the final statement and live
  // outside any try/catch.
  redirect(homeRouteForRole(profile.role as UserRole));
}

/**
 * Signs the current user out and returns them to the login page. Used as a
 * server action bound directly to a `<form>`.
 */
export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();

  redirect("/login");
}

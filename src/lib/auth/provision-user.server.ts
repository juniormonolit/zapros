import "server-only";

import type { UserRole } from "@/lib/auth";
import {
  createAuthUser,
  deleteAuthUser,
} from "@/lib/auth/users.server";
import { createAdminClient } from "@/lib/admin-client";

export type CreateAuthUserWithProfileResult =
  | { ok: true; userId: string }
  | { ok: false; error: string; code?: string };

/**
 * Creates `auth.users` row and linked `profiles` row (admin client bypasses RLS).
 * Rolls back auth user when profile insert fails.
 */
export async function createAuthUserWithProfile(params: {
  email: string;
  password: string;
  role: UserRole;
  fullName: string | null;
  supplierId: string | null;
}): Promise<CreateAuthUserWithProfileResult> {
  let userId: string;
  try {
    ({ id: userId } = await createAuthUser({
      email: params.email,
      password: params.password,
    }));
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    if (/unique|duplicate|already/i.test(message)) {
      return {
        ok: false,
        error: "Пользователь с таким email уже существует.",
      };
    }
    return { ok: false, error: "Не удалось создать пользователя." };
  }

  const admin = createAdminClient();
  const { error: profileError } = await admin.from("profiles").upsert(
    {
      id: userId,
      role: params.role,
      full_name: params.fullName,
      supplier_id: params.supplierId,
    },
    { onConflict: "id" },
  );

  if (profileError) {
    await deleteAuthUser(userId);
    return {
      ok: false,
      error: "Не удалось сохранить профиль пользователя.",
      code: profileError.code,
    };
  }

  return { ok: true, userId };
}

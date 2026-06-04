import "server-only";

import type { Profile, UserRole } from "@/lib/auth/profile-types";
import { PROFILE_COLUMNS } from "@/lib/auth/profile-types";
import { getPool } from "@/lib/db/pool";

const PROFILE_SELECT = PROFILE_COLUMNS.split(", ")
  .map((col) => col.trim())
  .join(", ");

/**
 * Loads a profile row with a single pool query (no transaction wrapper).
 * Used for layout guards and view-as resolution to avoid pool exhaustion.
 */
export async function loadProfileById(
  userId: string,
): Promise<Profile | null> {
  const pool = getPool();
  const { rows } = await pool.query<{
    id: string;
    role: UserRole;
    full_name: string | null;
    supplier_id: string | null;
    is_active: boolean;
  }>(
    `
    select ${PROFILE_SELECT}
    from public.profiles
    where id = $1
    limit 1
    `,
    [userId],
  );

  const row = rows[0];
  if (!row) return null;

  return {
    id: row.id,
    role: row.role,
    full_name: row.full_name,
    supplier_id: row.supplier_id,
    is_active: row.is_active,
  };
}

import "server-only";

import type { DbClient } from "@/lib/db/client";
import { loadResponseVersionsForInvites } from "@/lib/db/queries/response-versions";
import { getUser } from "@/lib/auth";

import type { ResponseVersionWithLines } from "@/lib/response-versions.types";

export type {
  ResponseVersionLine,
  ResponseVersionWithLines,
} from "@/lib/response-versions.types";

/**
 * Load all response versions for an invite with line items and request item names.
 * Ordered by `version_number` descending (newest first). RLS scopes supplier vs procurement.
 */
export async function loadVersionsForInvite(
  _supabase: DbClient,
  inviteId: string,
): Promise<ResponseVersionWithLines[]> {
  const user = await getUser();
  if (!user) {
    throw new Error("loadVersionsForInvite: not authenticated");
  }

  const map = await loadResponseVersionsForInvites(user.id, [inviteId]);
  return map.get(inviteId) ?? [];
}

/**
 * Load response versions for multiple invites in one query (procurement comparison).
 * Returns a map keyed by `request_suppliers.id`.
 */
export async function loadVersionsForInvites(
  _supabase: DbClient,
  inviteIds: string[],
): Promise<Map<string, ResponseVersionWithLines[]>> {
  const user = await getUser();
  if (!user) {
    throw new Error("loadVersionsForInvites: not authenticated");
  }

  return loadResponseVersionsForInvites(user.id, inviteIds);
}

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  formatEventAuthorName,
  type ThreadEvent,
} from "@/lib/request-events-display";
import type { RequestEventType } from "@/lib/request-events-types";

export type { ThreadEvent } from "@/lib/request-events-display";

function mapEventRow(
  row: {
    id: string;
    request_supplier_id: string;
    event_type: string;
    body: string | null;
    payload: Record<string, unknown> | null;
    created_at: string;
    author_id: string;
    profiles:
      | { full_name: string | null; role: string }
      | { full_name: string | null; role: string }[]
      | null;
  },
): ThreadEvent {
  const profile = Array.isArray(row.profiles)
    ? (row.profiles[0] ?? null)
    : row.profiles;

  return {
    id: row.id,
    requestSupplierId: row.request_supplier_id,
    eventType: row.event_type as RequestEventType,
    body: row.body,
    payload: row.payload,
    createdAt: row.created_at,
    authorId: row.author_id,
    authorName: formatEventAuthorName(profile?.full_name, profile?.role),
    authorRole: profile?.role ?? "",
  };
}

/**
 * Load chronological thread events for one invite (oldest first).
 */
export async function loadThreadEvents(
  supabase: SupabaseClient,
  requestSupplierId: string,
  limit = 200,
): Promise<ThreadEvent[]> {
  const { data, error } = await supabase
    .from("request_events")
    .select(
      `
      id,
      request_supplier_id,
      event_type,
      body,
      payload,
      created_at,
      author_id,
      profiles ( full_name, role )
    `,
    )
    .eq("request_supplier_id", requestSupplierId)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error || !data) return [];
  return data.map((row) => mapEventRow(row as Parameters<typeof mapEventRow>[0]));
}

/**
 * Batch-load thread events for multiple invites; grouped by invite id.
 */
export async function loadThreadEventsByInviteIds(
  supabase: SupabaseClient,
  inviteIds: readonly string[],
  limit = 500,
): Promise<Map<string, ThreadEvent[]>> {
  const result = new Map<string, ThreadEvent[]>();
  if (inviteIds.length === 0) return result;

  for (const id of inviteIds) {
    result.set(id, []);
  }

  const { data, error } = await supabase
    .from("request_events")
    .select(
      `
      id,
      request_supplier_id,
      event_type,
      body,
      payload,
      created_at,
      author_id,
      profiles ( full_name, role )
    `,
    )
    .in("request_supplier_id", [...inviteIds])
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error || !data) return result;

  for (const row of data) {
    const mapped = mapEventRow(row as Parameters<typeof mapEventRow>[0]);
    const list = result.get(mapped.requestSupplierId);
    if (list) list.push(mapped);
  }

  return result;
}

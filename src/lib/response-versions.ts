import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  ResponseVersionLine,
  ResponseVersionWithLines,
} from "@/lib/response-versions.types";

export type {
  ResponseVersionLine,
  ResponseVersionWithLines,
} from "@/lib/response-versions.types";

interface RequestItemJoin {
  name: string;
  sort_order: number;
}

interface LineRow {
  id: string;
  request_item_id: string;
  price_with_vat: number | null;
  price_cash: number | null;
  price_without_vat: number | null;
  delivery_price: number | null;
  price_includes_delivery: boolean;
  in_stock: boolean | null;
  lead_time_days: number | null;
  line_comment: string | null;
  request_items: RequestItemJoin | RequestItemJoin[] | null;
}

interface VersionRow {
  id: string;
  request_supplier_id: string;
  version_number: number;
  is_current: boolean;
  comment: string | null;
  submitted_at: string;
  response_line_items: LineRow[] | null;
}

const VERSIONS_SELECT = `id, request_supplier_id, version_number, is_current, comment, submitted_at,
       response_line_items (
         id, request_item_id, price_with_vat, price_cash, price_without_vat,
         delivery_price, price_includes_delivery, in_stock, lead_time_days,
         line_comment, request_items ( name, sort_order )
       )`;

function parseNumeric(value: number | string | null | undefined): number | null {
  if (value == null) return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function unwrapRequestItem(
  items: RequestItemJoin | RequestItemJoin[] | null,
): RequestItemJoin | null {
  if (!items) return null;
  return Array.isArray(items) ? (items[0] ?? null) : items;
}

function mapLine(row: LineRow): ResponseVersionLine {
  const item = unwrapRequestItem(row.request_items);
  return {
    id: row.id,
    requestItemId: row.request_item_id,
    itemName: item?.name ?? "—",
    sortOrder: item?.sort_order ?? 0,
    priceWithVat: parseNumeric(row.price_with_vat),
    priceCash: parseNumeric(row.price_cash),
    priceWithoutVat: parseNumeric(row.price_without_vat),
    deliveryPrice: parseNumeric(row.delivery_price),
    priceIncludesDelivery: row.price_includes_delivery,
    inStock: row.in_stock,
    leadTimeDays: row.lead_time_days,
    lineComment: row.line_comment,
  };
}

function sortLines(lines: ResponseVersionLine[]): ResponseVersionLine[] {
  return [...lines].sort((a, b) => a.sortOrder - b.sortOrder);
}

function mapVersionRow(row: VersionRow): ResponseVersionWithLines {
  return {
    id: row.id,
    versionNumber: row.version_number,
    isCurrent: row.is_current,
    comment: row.comment,
    submittedAt: row.submitted_at,
    lines: sortLines(
      ((row.response_line_items as LineRow[] | null) ?? []).map(mapLine),
    ),
  };
}

/**
 * Load all response versions for an invite with line items and request item names.
 * Ordered by `version_number` descending (newest first). RLS scopes supplier vs procurement.
 */
export async function loadVersionsForInvite(
  supabase: SupabaseClient,
  inviteId: string,
): Promise<ResponseVersionWithLines[]> {
  const { data, error } = await supabase
    .from("supplier_response_versions")
    .select(VERSIONS_SELECT)
    .eq("request_supplier_id", inviteId)
    .order("version_number", { ascending: false });

  if (error) {
    throw new Error(`loadVersionsForInvite: ${error.message}`);
  }

  const rows = (data as VersionRow[] | null) ?? [];
  return rows.map(mapVersionRow);
}

/**
 * Load response versions for multiple invites in one query (procurement comparison).
 * Returns a map keyed by `request_suppliers.id`.
 */
export async function loadVersionsForInvites(
  supabase: SupabaseClient,
  inviteIds: string[],
): Promise<Map<string, ResponseVersionWithLines[]>> {
  const result = new Map<string, ResponseVersionWithLines[]>();
  if (inviteIds.length === 0) return result;

  const { data, error } = await supabase
    .from("supplier_response_versions")
    .select(VERSIONS_SELECT)
    .in("request_supplier_id", inviteIds)
    .order("version_number", { ascending: false });

  if (error) {
    throw new Error(`loadVersionsForInvites: ${error.message}`);
  }

  const rows = (data as VersionRow[] | null) ?? [];
  for (const row of rows) {
    const inviteId = row.request_supplier_id;
    const list = result.get(inviteId) ?? [];
    list.push(mapVersionRow(row));
    result.set(inviteId, list);
  }

  for (const id of inviteIds) {
    if (!result.has(id)) result.set(id, []);
  }

  return result;
}

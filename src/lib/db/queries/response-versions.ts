import "server-only";

import type {
  ResponseVersionLine,
  ResponseVersionWithLines,
} from "@/lib/response-versions.types";
import { withDbSession } from "@/lib/db/session";

interface VersionQueryRow {
  version_id: string;
  request_supplier_id: string;
  version_number: number;
  is_current: boolean;
  comment: string | null;
  submitted_at: string;
  line_id: string | null;
  request_item_id: string | null;
  price_with_vat: string | number | null;
  price_cash: string | number | null;
  price_without_vat: string | number | null;
  delivery_price: string | number | null;
  price_includes_delivery: boolean | null;
  in_stock: boolean | null;
  lead_time_days: number | null;
  line_comment: string | null;
  item_name: string | null;
  sort_order: number | null;
}

function parseNumeric(value: string | number | null | undefined): number | null {
  if (value == null) return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function mapLine(row: VersionQueryRow): ResponseVersionLine {
  return {
    id: row.line_id!,
    requestItemId: row.request_item_id!,
    itemName: row.item_name ?? "—",
    sortOrder: row.sort_order ?? 0,
    priceWithVat: parseNumeric(row.price_with_vat),
    priceCash: parseNumeric(row.price_cash),
    priceWithoutVat: parseNumeric(row.price_without_vat),
    deliveryPrice: parseNumeric(row.delivery_price),
    priceIncludesDelivery: row.price_includes_delivery ?? false,
    inStock: row.in_stock,
    leadTimeDays: row.lead_time_days,
    lineComment: row.line_comment,
  };
}

function assembleVersions(rows: VersionQueryRow[]): ResponseVersionWithLines[] {
  const byVersion = new Map<string, ResponseVersionWithLines>();

  for (const row of rows) {
    let version = byVersion.get(row.version_id);
    if (!version) {
      version = {
        id: row.version_id,
        versionNumber: row.version_number,
        isCurrent: row.is_current,
        comment: row.comment,
        submittedAt: row.submitted_at,
        lines: [],
      };
      byVersion.set(row.version_id, version);
    }

    if (row.line_id) {
      version.lines.push(mapLine(row));
    }
  }

  return [...byVersion.values()].map((version) => ({
    ...version,
    lines: [...version.lines].sort((a, b) => a.sortOrder - b.sortOrder),
  }));
}

export async function loadResponseVersionsForInvites(
  userId: string,
  inviteIds: string[],
): Promise<Map<string, ResponseVersionWithLines[]>> {
  const result = new Map<string, ResponseVersionWithLines[]>();
  if (inviteIds.length === 0) return result;

  const versionsByInvite = await withDbSession(userId, async (client) => {
    const { rows } = await client.query<VersionQueryRow>(
      `
      select
        v.id as version_id,
        v.request_supplier_id,
        v.version_number,
        v.is_current,
        v.comment,
        v.submitted_at,
        l.id as line_id,
        l.request_item_id,
        l.price_with_vat,
        l.price_cash,
        l.price_without_vat,
        l.delivery_price,
        l.price_includes_delivery,
        l.in_stock,
        l.lead_time_days,
        l.line_comment,
        ri.name as item_name,
        ri.sort_order
      from public.supplier_response_versions v
      left join public.response_line_items l on l.version_id = v.id
      left join public.request_items ri on ri.id = l.request_item_id
      where v.request_supplier_id = any($1::uuid[])
      order by v.request_supplier_id, v.version_number desc, ri.sort_order asc nulls last
      `,
      [inviteIds],
    );

    const grouped = new Map<string, VersionQueryRow[]>();
    for (const row of rows) {
      const list = grouped.get(row.request_supplier_id) ?? [];
      list.push(row);
      grouped.set(row.request_supplier_id, list);
    }
    return grouped;
  });

  for (const inviteId of inviteIds) {
    const rows = versionsByInvite.get(inviteId) ?? [];
    result.set(inviteId, assembleVersions(rows));
  }

  return result;
}

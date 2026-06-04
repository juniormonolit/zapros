import "server-only";

import type {
  PickerGroup,
  PickerSupplier,
} from "@/components/requests/supplier-picker";
import { ensureRows } from "@/lib/db/types";
import { createClient } from "@/lib/app-client";

/**
 * Sourcing stages a supplier must be at to be selectable in a request
 * (`available_for_selection` per data-model.md / F010). `working_in_zapros`
 * suppliers get an in-system invite; `approved` ones are "contact manually".
 */
const AVAILABLE_SOURCING_STATUSES = ["approved", "working_in_zapros"] as const;

/**
 * Data shape consumed by {@link SupplierPicker}: every available supplier, the
 * groups they belong to (with available members only), and the available
 * suppliers that belong to no group.
 */
export interface AvailableSuppliersData {
  suppliers: PickerSupplier[];
  groups: PickerGroup[];
  ungroupedSupplierIds: string[];
}

/** Raw membership row from `supplier_group_members`. */
interface MemberRow {
  group_id: string;
  supplier_id: string;
}

/** Raw group row from `supplier_groups`. */
interface GroupRow {
  id: string;
  name: string;
  sort_order: number;
}

/**
 * Load the suppliers a procurement user may select for a request, grouped for
 * the picker tree.
 *
 * Only `is_active` suppliers in an `available_for_selection` stage are returned.
 * RLS already restricts this for the procurement role; the explicit filter is a
 * second barrier (defense in depth) and keeps the result correct for admins too.
 *
 * A supplier may belong to several groups, so it can appear under more than one
 * group node; the picker dedupes the actual selection by `supplier_id`. Groups
 * with no available members are omitted to avoid empty nodes.
 */
export async function loadAvailableSuppliers(): Promise<AvailableSuppliersData> {
  const supabase = await createClient();

  const [suppliersResult, groupsResult, membersResult] = await Promise.all([
    supabase
      .from("suppliers")
      .select("id, name, works_in_zapros, contact_person, phone, email")
      .eq("is_active", true)
      .in("sourcing_status", AVAILABLE_SOURCING_STATUSES as unknown as string[])
      .order("name", { ascending: true }),
    supabase
      .from("supplier_groups")
      .select("id, name, sort_order")
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
    supabase.from("supplier_group_members").select("group_id, supplier_id"),
  ]);

  const suppliers = ensureRows(
    suppliersResult.data,
  ) as unknown as PickerSupplier[];
  const groupRows = ensureRows(groupsResult.data) as unknown as GroupRow[];
  const memberRows = ensureRows(membersResult.data) as unknown as MemberRow[];

  return buildAvailableSuppliersData(suppliers, groupRows, memberRows);
}

/**
 * Pure assembly step (no I/O) kept separate so it stays trivially testable:
 * filters memberships down to the available suppliers, builds non-empty group
 * nodes preserving the query order, and collects the leftover ungrouped ids.
 */
function buildAvailableSuppliersData(
  suppliers: PickerSupplier[],
  groupRows: GroupRow[],
  memberRows: MemberRow[],
): AvailableSuppliersData {
  const availableIds = new Set(suppliers.map((supplier) => supplier.id));

  const membersByGroup = new Map<string, string[]>();
  for (const row of memberRows) {
    if (!availableIds.has(row.supplier_id)) continue;
    const ids = membersByGroup.get(row.group_id) ?? [];
    ids.push(row.supplier_id);
    membersByGroup.set(row.group_id, ids);
  }

  const grouped = new Set<string>();
  const groups: PickerGroup[] = [];
  for (const group of groupRows) {
    const supplierIds = membersByGroup.get(group.id) ?? [];
    if (supplierIds.length === 0) continue;
    for (const id of supplierIds) grouped.add(id);
    groups.push({ id: group.id, name: group.name, supplierIds });
  }

  const ungroupedSupplierIds = suppliers
    .filter((supplier) => !grouped.has(supplier.id))
    .map((supplier) => supplier.id);

  return { suppliers, groups, ungroupedSupplierIds };
}

import { redirect } from "next/navigation";

import type {
  Supplier,
  SupplierGroup,
  SupplierGroupMember,
} from "@/actions/admin-catalog-types";
import { GroupManager } from "@/components/admin/group-manager";
import { getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/**
 * Supplier groups admin section: group CRUD plus many-to-many membership
 * management. Gated by middleware, this server admin check, and RLS.
 */
export default async function AdminGroupsPage() {
  const profile = await getProfile();
  if (!profile || profile.role !== "admin") {
    redirect("/login");
  }

  const supabase = await createClient();

  const [groupsResult, suppliersResult, membersResult] = await Promise.all([
    supabase
      .from("supplier_groups")
      .select("id, name, sort_order, created_at")
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
    supabase
      .from("suppliers")
      .select("id, name, is_active, created_at")
      .order("name", { ascending: true }),
    supabase
      .from("supplier_group_members")
      .select("group_id, supplier_id"),
  ]);

  return (
    <GroupManager
      groups={(groupsResult.data as SupplierGroup[]) ?? []}
      suppliers={(suppliersResult.data as Supplier[]) ?? []}
      members={(membersResult.data as SupplierGroupMember[]) ?? []}
    />
  );
}

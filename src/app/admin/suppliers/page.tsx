import { redirect } from "next/navigation";

import type { Supplier } from "@/actions/admin-catalog-types";
import { SupplierManager } from "@/components/admin/supplier-manager";
import { getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/**
 * Suppliers admin section. Access is gated three ways: middleware (route),
 * this server check (defense in depth), and database RLS (mutations). Reads
 * happen with the cookie-bound server client, which RLS allows for admin.
 */
export default async function AdminSuppliersPage() {
  const profile = await getProfile();
  if (!profile || profile.role !== "admin") {
    redirect("/login");
  }

  const supabase = await createClient();
  const { data } = await supabase
    .from("suppliers")
    .select(
      "id, name, is_active, contact_person, phone, email, notes, sourcing_status, works_in_zapros, created_at",
    )
    .order("name", { ascending: true });

  return <SupplierManager suppliers={(data as Supplier[]) ?? []} />;
}

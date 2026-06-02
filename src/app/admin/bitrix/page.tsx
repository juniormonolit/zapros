import { redirect } from "next/navigation";

import type { BitrixSetting } from "@/actions/admin-catalog-types";
import { BitrixManager } from "@/components/admin/bitrix-manager";
import { getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/**
 * Bitrix group settings admin section: CRUD over the URL templates the task
 * parser uses. Gated by middleware, this server admin check, and RLS.
 */
export default async function AdminBitrixPage() {
  const profile = await getProfile();
  if (!profile || profile.role !== "admin") {
    redirect("/login");
  }

  const supabase = await createClient();
  const { data } = await supabase
    .from("bitrix_group_settings")
    .select("id, name, url_template, is_active, created_at")
    .order("name", { ascending: true });

  return <BitrixManager settings={(data as BitrixSetting[]) ?? []} />;
}

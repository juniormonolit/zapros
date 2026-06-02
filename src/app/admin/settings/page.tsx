import { redirect } from "next/navigation";

import { SettingsForm } from "@/components/admin/settings-form";
import { getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/** Defaults mirrored from migration 002 seeds, used when a key is missing. */
const DEFAULTS = {
  response_deadline_days: "10",
  cash_to_noncash_ratio: "0.84",
} as const;

/**
 * Global app settings admin section. Reads the `app_settings` key-value rows
 * and renders the edit form. Gated by middleware, this server admin check, and
 * RLS.
 */
export default async function AdminSettingsPage() {
  const profile = await getProfile();
  if (!profile || profile.role !== "admin") {
    redirect("/login");
  }

  const supabase = await createClient();
  const { data } = await supabase
    .from("app_settings")
    .select("key, value")
    .in("key", ["response_deadline_days", "cash_to_noncash_ratio"]);

  const values = new Map(
    (data ?? []).map((row) => [String(row.key), String(row.value)]),
  );

  return (
    <SettingsForm
      responseDeadlineDays={
        values.get("response_deadline_days") ?? DEFAULTS.response_deadline_days
      }
      cashToNoncashRatio={
        values.get("cash_to_noncash_ratio") ?? DEFAULTS.cash_to_noncash_ratio
      }
    />
  );
}

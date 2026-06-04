import { redirect } from "next/navigation";

import { ViewAsBoardPanel } from "@/components/admin/view-as-board-panel";
import { PROCUREMENT_NAV } from "@/components/navigation/nav-config";
import { NavLinks } from "@/components/navigation/nav-links";
import { Topbar } from "@/components/navigation/topbar";
import { getProfile, homeRouteForRole } from "@/lib/auth";

/**
 * Procurement shell with role guard (defence in depth; middleware is auth-only).
 */
export default async function ProcurementLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const profile = await getProfile();

  if (!profile) {
    redirect("/login");
  }

  if (!profile.is_active) {
    redirect("/login");
  }

  if (profile.role !== "procurement" && profile.role !== "admin") {
    redirect(homeRouteForRole(profile.role));
  }

  return (
    <div className="flex min-h-svh flex-col bg-bg-primary">
      <Topbar />
      <ViewAsBoardPanel />
      <div className="border-b border-border-primary bg-bg-card">
        <div className="overflow-x-auto px-4 sm:px-6">
          <NavLinks items={PROCUREMENT_NAV} orientation="horizontal" />
        </div>
      </div>
      <main className="flex-1 p-4 sm:p-6">{children}</main>
    </div>
  );
}

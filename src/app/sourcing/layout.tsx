import { redirect } from "next/navigation";

import { getProfile, homeRouteForRole } from "@/lib/auth";
import { NavLinks } from "@/components/navigation/nav-links";
import { SOURCING_NAV } from "@/components/navigation/nav-config";
import { Topbar } from "@/components/navigation/topbar";

/**
 * Senior-procurement shell: shared topbar plus a single "Проработка" tab.
 * Mirrors the supplier/procurement layouts and adds a server-side guard so the
 * section is reachable only by `senior_procurement` (middleware enforces the
 * same rule; this is defence in depth and covers direct server renders).
 */
export default async function SourcingLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const profile = await getProfile();

  if (!profile) {
    redirect("/login");
  }

  if (profile.role !== "senior_procurement") {
    redirect(homeRouteForRole(profile.role));
  }

  return (
    <div className="flex min-h-svh flex-col bg-bg-primary">
      <Topbar />
      <div className="border-b border-border-primary bg-bg-card">
        <div className="overflow-x-auto px-4 sm:px-6">
          <NavLinks items={SOURCING_NAV} orientation="horizontal" />
        </div>
      </div>
      <main className="flex-1 p-4 sm:p-6">{children}</main>
    </div>
  );
}

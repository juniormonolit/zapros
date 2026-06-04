import { redirect } from "next/navigation";

import { listUsersForViewAs } from "@/actions/view-as";
import { ViewAsPicker } from "@/components/admin/view-as-picker";
import { getAdminBoardNav, getAdminNavForRole } from "@/components/navigation/nav-config";
import { NavLinks } from "@/components/navigation/nav-links";
import { Topbar } from "@/components/navigation/topbar";
import { getProfile, homeRouteForRole } from "@/lib/auth";
import {
  getViewAsUserIdFromCookies,
  isAdminViewAsEnabled,
} from "@/lib/view-as";

/**
 * Admin shell with role guard (defence in depth; middleware is auth-only).
 */
export default async function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const profile = await getProfile();

  if (!profile || !profile.is_active) {
    redirect("/login");
  }

  if (profile.role !== "admin" && profile.role !== "senior_procurement") {
    redirect(homeRouteForRole(profile.role));
  }

  const adminNav = getAdminNavForRole(profile.role);
  const boardNav = profile.role === "admin" ? getAdminBoardNav() : [];
  const viewAsEnabled = profile.role === "admin" && isAdminViewAsEnabled();
  const [viewAsGroups, currentViewAsUserId] = viewAsEnabled
    ? await Promise.all([
        listUsersForViewAs(),
        getViewAsUserIdFromCookies(),
      ])
    : [[], null];

  return (
    <div className="flex min-h-svh flex-col bg-bg-primary">
      <Topbar alignLogoWithSidebar />
      <div className="flex flex-1 flex-col md:flex-row">
        <aside className="hidden w-60 shrink-0 border-r border-border-primary bg-bg-card p-3 md:block">
          <NavLinks items={adminNav} orientation="vertical" />
          {boardNav.length > 0 ? (
            <div className="mt-4 border-t border-border-primary pt-4">
              <p className="mb-2 px-3 text-xs font-medium tracking-wide text-text-secondary uppercase">
                Просмотр досок
              </p>
              <NavLinks items={boardNav} orientation="vertical" />
            </div>
          ) : null}
          {viewAsEnabled ? (
            <div className="mt-4 border-t border-border-primary pt-4">
              <ViewAsPicker
                groups={viewAsGroups}
                currentViewAsUserId={currentViewAsUserId}
              />
            </div>
          ) : null}
        </aside>
        <main className="flex-1 p-4 sm:p-6">
          <div className="-mx-4 mb-4 overflow-x-auto border-b border-border-primary px-4 md:hidden">
            <NavLinks items={adminNav} orientation="horizontal" />
            {boardNav.length > 0 ? (
              <div className="mt-3 border-t border-border-primary pt-3">
                <p className="mb-2 text-xs font-medium tracking-wide text-text-secondary uppercase">
                  Просмотр досок
                </p>
                <NavLinks items={boardNav} orientation="horizontal" />
              </div>
            ) : null}
            {viewAsEnabled ? (
              <div className="mt-3 border-t border-border-primary pt-3 pb-3">
                <ViewAsPicker
                  groups={viewAsGroups}
                  currentViewAsUserId={currentViewAsUserId}
                />
              </div>
            ) : null}
          </div>
          {children}
        </main>
      </div>
    </div>
  );
}

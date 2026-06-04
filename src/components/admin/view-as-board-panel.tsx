import { listUsersForViewAs } from "@/actions/view-as";
import { ViewAsPicker } from "@/components/admin/view-as-picker";
import { getProfile } from "@/lib/auth";
import {
  getViewAsUserIdFromCookies,
  isAdminViewAsEnabled,
} from "@/lib/view-as";

/**
 * View-as picker on role board layouts so admin does not need to return to /admin
 * before opening /sourcing, /app, or /supplier.
 */
export async function ViewAsBoardPanel() {
  if (!isAdminViewAsEnabled()) return null;

  const profile = await getProfile();
  if (profile?.role !== "admin") return null;

  const [groups, currentViewAsUserId] = await Promise.all([
    listUsersForViewAs(),
    getViewAsUserIdFromCookies(),
  ]);

  return (
    <div className="border-b border-border-primary bg-bg-card px-4 py-3 sm:px-6">
      <ViewAsPicker groups={groups} currentViewAsUserId={currentViewAsUserId} />
    </div>
  );
}

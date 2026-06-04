import { ROLE_LABELS } from "@/components/navigation/nav-config";
import { ViewAsBanner } from "@/components/admin/view-as-banner";
import { getProfile, getEffectiveProfile } from "@/lib/auth";
import { findUserById } from "@/lib/auth/users.server";
import {
  getViewAsUserIdFromCookies,
  isAdminViewAsEnabled,
} from "@/lib/view-as";

/**
 * Server wrapper: renders the impersonation banner only for admins with an
 * active view-as cookie (session topbar still shows the real admin).
 */
export async function ViewAsBannerSlot() {
  if (!isAdminViewAsEnabled()) return null;

  const sessionProfile = await getProfile();
  if (sessionProfile?.role !== "admin") return null;

  const viewAsUserId = await getViewAsUserIdFromCookies();
  if (!viewAsUserId) return null;

  const effectiveProfile = await getEffectiveProfile();
  if (!effectiveProfile || effectiveProfile.id !== viewAsUserId) {
    return null;
  }

  const authUser = await findUserById(effectiveProfile.id);
  const displayName =
    effectiveProfile.full_name?.trim() ||
    authUser?.email?.trim() ||
    effectiveProfile.id;

  return (
    <ViewAsBanner
      displayName={displayName}
      roleLabel={ROLE_LABELS[effectiveProfile.role]}
    />
  );
}

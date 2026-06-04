export const VIEW_AS_COOKIE = "zapros_view_as_user_id";

/** Default enabled unless explicitly set to `'false'`. */
export function isAdminViewAsEnabled(): boolean {
  return process.env.ENABLE_ADMIN_VIEW_AS !== "false";
}

/**
 * Pure resolver for effective DB user id (session vs admin view-as).
 */
export function resolveEffectiveDbUserId(params: {
  sessionUserId: string | undefined;
  sessionRole: string | null;
  viewAsUserId: string | null;
  viewAsEnabled: boolean;
  viewAsTargetActive: boolean;
}): string | undefined {
  const {
    sessionUserId,
    sessionRole,
    viewAsUserId,
    viewAsEnabled,
    viewAsTargetActive,
  } = params;

  if (!sessionUserId) return undefined;

  if (
    viewAsEnabled &&
    sessionRole === "admin" &&
    viewAsUserId &&
    viewAsTargetActive
  ) {
    return viewAsUserId;
  }

  return sessionUserId;
}

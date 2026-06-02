import { ROLE_LABELS } from "@/components/navigation/nav-config";
import { LogoutButton } from "@/components/logout-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { getProfile } from "@/lib/auth";

/**
 * Application top bar shared by every role's layout. Shows the signed-in
 * user's name and role (read server-side from {@link getProfile}), the theme
 * toggle, and the logout control. Colors come from design tokens so it follows
 * the active light/dark theme.
 */
export async function Topbar() {
  const profile = await getProfile();
  const roleLabel = profile ? ROLE_LABELS[profile.role] : null;

  return (
    <header className="sticky top-0 z-10 flex h-14 items-center justify-between gap-4 border-b border-border-primary bg-bg-card px-4 sm:px-6">
      <span className="text-base font-semibold text-text-primary">Запросы</span>

      <div className="flex items-center gap-2 sm:gap-3">
        <div className="hidden text-right leading-tight sm:block">
          <p className="text-sm font-medium text-text-primary">
            {profile?.full_name ?? "—"}
          </p>
          {roleLabel ? (
            <p className="text-xs text-text-secondary">{roleLabel}</p>
          ) : null}
        </div>
        <ThemeToggle />
        <LogoutButton />
      </div>
    </header>
  );
}

import Link from "next/link";

import { ViewAsBannerSlot } from "@/components/admin/view-as-banner-slot";
import { BrandLogo } from "@/components/brand/brand-logo";
import { ROLE_LABELS } from "@/components/navigation/nav-config";
import { LogoutButton } from "@/components/logout-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { getProfile, homeRouteForRole } from "@/lib/auth";

interface TopbarProps {
  /** Centers the logo in a `w-60` column aligned with the admin sidebar. */
  alignLogoWithSidebar?: boolean;
}

/**
 * Application top bar shared by every role's layout. Shows the signed-in
 * user's name and role (read server-side from {@link getProfile}), the theme
 * toggle, and the logout control. Colors come from design tokens so it follows
 * the active light/dark theme.
 */
export async function Topbar({ alignLogoWithSidebar = false }: TopbarProps) {
  const profile = await getProfile();
  const roleLabel = profile ? ROLE_LABELS[profile.role] : null;
  const homeHref = profile ? homeRouteForRole(profile.role) : "/login";

  const logoLinkClass =
    "flex items-center justify-center rounded-md py-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus";

  const controls = (
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
  );

  return (
    <>
      <header className="sticky top-0 z-10 flex min-h-16 items-stretch border-b border-border-primary bg-bg-card">
        {alignLogoWithSidebar ? (
          <>
            <div className="hidden w-60 shrink-0 items-center justify-center border-r border-border-primary px-4 py-3.5 md:flex">
              <Link
                href={homeHref}
                className={logoLinkClass}
                aria-label="Zapros — на главную"
              >
                <BrandLogo variant="header" centered />
              </Link>
            </div>
            <div className="flex min-h-16 flex-1 items-center justify-between gap-4 px-4 py-3 sm:px-6">
              <Link
                href={homeHref}
                className={`${logoLinkClass} md:hidden`}
                aria-label="Zapros — на главную"
              >
                <BrandLogo variant="header" />
              </Link>
              <div className="ml-auto flex items-center">{controls}</div>
            </div>
          </>
        ) : (
          <div className="flex min-h-16 w-full items-center justify-between gap-4 px-4 py-3 sm:px-6">
            <Link
              href={homeHref}
              className={logoLinkClass}
              aria-label="Zapros — на главную"
            >
              <BrandLogo variant="header" />
            </Link>
            {controls}
          </div>
        )}
      </header>
      <ViewAsBannerSlot />
    </>
  );
}

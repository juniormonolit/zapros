"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Layers,
  Link as LinkIcon,
  Settings,
  Truck,
  Users,
  type LucideIcon,
} from "lucide-react";

import type { NavItem } from "@/components/navigation/nav-config";
import { cn } from "@/lib/utils";

/** Maps the string icon keys from `nav-config` to concrete Lucide icons. */
const ICONS: Record<string, LucideIcon> = {
  users: Users,
  truck: Truck,
  layers: Layers,
  link: LinkIcon,
  settings: Settings,
};

type Orientation = "horizontal" | "vertical";

interface NavLinksProps {
  items: NavItem[];
  orientation?: Orientation;
}

/**
 * Returns true when `href` matches `pathname` exactly or as a parent segment.
 */
function matches(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Picks the most specific matching href so that an index route (e.g. `/app`)
 * is not highlighted while a nested route (e.g. `/app/requests`) is active.
 */
function activeHref(pathname: string, items: NavItem[]): string | undefined {
  return items
    .filter((item) => matches(pathname, item.href))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;
}

/**
 * Role navigation rendered as horizontal tabs (with mobile horizontal scroll)
 * or a vertical sidebar list. The active item is derived from the current
 * pathname on the client. All colors come from design tokens.
 */
export function NavLinks({ items, orientation = "horizontal" }: NavLinksProps) {
  const pathname = usePathname();
  const active = activeHref(pathname, items);

  const isVertical = orientation === "vertical";

  return (
    <nav
      aria-label="Разделы"
      className={cn(
        "flex gap-1",
        isVertical ? "flex-col" : "min-w-max flex-row items-center",
      )}
    >
      {items.map((item) => {
        const Icon = item.icon ? ICONS[item.icon] : undefined;
        const isActive = item.href === active;

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "flex items-center gap-2 text-sm whitespace-nowrap transition-colors",
              isVertical
                ? "rounded-md px-3 py-2"
                : "border-b-2 px-3 py-3 -mb-px",
              isVertical
                ? isActive
                  ? "bg-bg-secondary font-medium text-text-primary"
                  : "text-text-secondary hover:bg-bg-secondary hover:text-text-primary"
                : isActive
                  ? "border-accent-primary font-medium text-text-primary"
                  : "border-transparent text-text-secondary hover:text-text-primary",
            )}
          >
            {Icon ? <Icon className="size-4" aria-hidden="true" /> : null}
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

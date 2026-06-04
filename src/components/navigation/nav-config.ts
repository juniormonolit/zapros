import type { UserRole } from "@/lib/auth";
import { isAdminViewAsEnabled } from "@/lib/view-as";

/**
 * A single navigation entry. `icon` is a string key (resolved to a Lucide icon
 * in the client `NavLinks` component) so the config stays plain data and can be
 * passed from a Server Component to a Client Component without serialization
 * errors.
 */
export interface NavItem {
  href: string;
  label: string;
  icon?: string;
}

/** Admin sections — see `ai_docs/develop/features/F008-admin-settings.md`. */
export const ADMIN_NAV: NavItem[] = [
  { href: "/admin/users", label: "Пользователи", icon: "users" },
  { href: "/admin/suppliers", label: "Поставщики", icon: "truck" },
  { href: "/admin/groups", label: "Группы", icon: "layers" },
  { href: "/admin/bitrix", label: "Bitrix", icon: "link" },
  { href: "/admin/settings", label: "Настройки", icon: "settings" },
];

/** Admin shortcuts to role boards (shown when `ENABLE_ADMIN_VIEW_AS` is on). */
export const ADMIN_BOARD_NAV: NavItem[] = [
  { href: "/sourcing", label: "Проработка", icon: "layout-grid" },
  { href: "/app", label: "Снабжение", icon: "layout-grid" },
  { href: "/supplier", label: "Поставщик", icon: "layout-grid" },
];

/** Board preview links for admin sidebar; empty when view-as flag is off. */
export function getAdminBoardNav(): NavItem[] {
  return isAdminViewAsEnabled() ? ADMIN_BOARD_NAV : [];
}

/** Procurement tabs — see `ai_docs/design/kanban-and-filters-ux.md`. */
export const PROCUREMENT_NAV: NavItem[] = [
  { href: "/app", label: "Задачи" },
  { href: "/app/requests", label: "Запросы" },
  { href: "/app/table", label: "Таблица" },
];

/** Supplier has a single board: "Мои запросы". */
export const SUPPLIER_NAV: NavItem[] = [
  { href: "/supplier", label: "Мои запросы" },
];

/** Senior procurement has a single board: "Проработка". */
export const SOURCING_NAV: NavItem[] = [
  { href: "/sourcing", label: "Проработка" },
];

/** Human-readable role labels for the topbar. */
export const ROLE_LABELS: Record<UserRole, string> = {
  admin: "Администратор",
  procurement: "Снабженец",
  supplier: "Поставщик",
  senior_procurement: "Старший снабженец",
};

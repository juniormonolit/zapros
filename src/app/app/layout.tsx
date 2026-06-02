import { PROCUREMENT_NAV } from "@/components/navigation/nav-config";
import { NavLinks } from "@/components/navigation/nav-links";
import { Topbar } from "@/components/navigation/topbar";

/**
 * Procurement shell: shared topbar plus a tab row (Задачи / Запросы /
 * Таблица). Tabs scroll horizontally on narrow screens. Only procurement
 * navigation is rendered here.
 */
export default function ProcurementLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex min-h-svh flex-col bg-bg-primary">
      <Topbar />
      <div className="border-b border-border-primary bg-bg-card">
        <div className="overflow-x-auto px-4 sm:px-6">
          <NavLinks items={PROCUREMENT_NAV} orientation="horizontal" />
        </div>
      </div>
      <main className="flex-1 p-4 sm:p-6">{children}</main>
    </div>
  );
}

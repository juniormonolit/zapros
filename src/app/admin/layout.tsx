import { ADMIN_NAV } from "@/components/navigation/nav-config";
import { NavLinks } from "@/components/navigation/nav-links";
import { Topbar } from "@/components/navigation/topbar";

/**
 * Admin shell: shared topbar plus a section sidebar (Пользователи / Поставщики
 * / Группы / Bitrix / Настройки). On mobile the sidebar collapses into a
 * horizontally scrollable tab row. Only admin navigation is rendered here, so
 * other roles never see these entries (access is also enforced by middleware).
 */
export default function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex min-h-svh flex-col bg-bg-primary">
      <Topbar />
      <div className="flex flex-1 flex-col md:flex-row">
        <aside className="hidden w-60 shrink-0 border-r border-border-primary bg-bg-card p-3 md:block">
          <NavLinks items={ADMIN_NAV} orientation="vertical" />
        </aside>
        <main className="flex-1 p-4 sm:p-6">
          <div className="-mx-4 mb-4 overflow-x-auto border-b border-border-primary px-4 md:hidden">
            <NavLinks items={ADMIN_NAV} orientation="horizontal" />
          </div>
          {children}
        </main>
      </div>
    </div>
  );
}

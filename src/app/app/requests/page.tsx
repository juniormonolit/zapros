import { RequestsView } from "@/components/requests/requests-view";
import { buildRequestFilterOptions } from "@/lib/request-filter-options";
import { loadRequestListRows } from "@/lib/db/queries/request-list";
import { mapRequestRowsToListItems } from "@/lib/requests-list-data";
import { getUser } from "@/lib/auth";

/**
 * Procurement requests (`/app/requests`): list + kanban with shared filters.
 */
export default async function RequestsPage() {
  const user = await getUser();
  if (!user) return null;

  const rows = await loadRequestListRows(user.id);
  const now = new Date();
  const items = mapRequestRowsToListItems(rows, now);
  const filterOptions = buildRequestFilterOptions(items);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold text-text-primary">Запросы</h1>
      </header>

      <RequestsView items={items} filterOptions={filterOptions} />
    </div>
  );
}

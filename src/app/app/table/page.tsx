import { RequestsTableView } from "@/components/requests/requests-table-view";
import { buildRequestFilterOptions } from "@/lib/request-filter-options";
import { loadRequestListRows } from "@/lib/db/queries/request-list";
import { mapRequestRowsToListItems } from "@/lib/requests-list-data";
import { getUser } from "@/lib/auth";

/** Tabular request view with the same filters as `/app/requests`. */
export default async function ProcurementTablePage() {
  const user = await getUser();
  if (!user) return null;

  const rows = await loadRequestListRows(user.id);
  const items = mapRequestRowsToListItems(rows, new Date());
  const filterOptions = buildRequestFilterOptions(items);

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-xl font-semibold text-text-primary">Таблица</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Запросы с фильтрами и сортировкой. Нажмите на строку, чтобы открыть
          карточку.
        </p>
      </header>

      <RequestsTableView items={items} filterOptions={filterOptions} />
    </div>
  );
}

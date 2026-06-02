import { RequestsTableView } from "@/components/requests/requests-table-view";
import { buildRequestFilterOptions } from "@/lib/request-filter-options";
import {
  REQUEST_LIST_SELECT,
  mapRequestRowsToListItems,
  type RequestRow,
} from "@/lib/requests-list-data";
import { createClient } from "@/lib/supabase/server";

/** Tabular request view with the same filters as `/app/requests`. */
export default async function ProcurementTablePage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("requests")
    .select(REQUEST_LIST_SELECT)
    .order("created_at", { ascending: false });

  const rows = (data as RequestRow[] | null) ?? [];
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

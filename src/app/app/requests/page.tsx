import { RequestsView } from "@/components/requests/requests-view";
import { buildRequestFilterOptions } from "@/lib/request-filter-options";
import {
  REQUEST_LIST_SELECT,
  mapRequestRowsToListItems,
  type RequestRow,
} from "@/lib/requests-list-data";
import { createClient } from "@/lib/supabase/server";

/**
 * Procurement requests (`/app/requests`): list + kanban with shared filters.
 */
export default async function RequestsPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("requests")
    .select(REQUEST_LIST_SELECT)
    .order("created_at", { ascending: false });

  const rows = (data as RequestRow[] | null) ?? [];
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

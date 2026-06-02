import type { RequestListItem } from "@/components/requests/request-list";
import type { RequestFilterOptions } from "@/lib/request-filter-types";

/** Build filter dropdown options from loaded request rows. */
export function buildRequestFilterOptions(
  items: RequestListItem[],
): RequestFilterOptions {
  const categories = new Set<string>();
  const supplierLabels = new Map<string, string>();

  for (const item of items) {
    const cat = item.category?.trim();
    if (cat) categories.add(cat);
    for (const id of item.supplierIds) {
      if (!supplierLabels.has(id)) {
        supplierLabels.set(id, id.slice(0, 8));
      }
    }
  }

  return {
    categories: [...categories].sort((a, b) => a.localeCompare(b, "ru")),
    suppliers: [...supplierLabels.entries()]
      .map(([id, label]) => ({ id, label }))
      .sort((a, b) => a.label.localeCompare(b.label, "ru")),
  };
}

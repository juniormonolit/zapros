import type {
  SupplierKind,
  SupplierListFilters,
  WavePriority,
} from "@/actions/supplier-org-types";
import {
  SUPPLIER_KINDS,
  WAVE_PRIORITIES,
} from "@/actions/supplier-org-types";

import type { SupplierListFilterValues } from "@/components/admin/supplier-org-list";

export function filtersFromSearchParams(
  params: Record<string, string | string[] | undefined>,
): SupplierListFilterValues {
  const pick = (key: string) => {
    const raw = params[key];
    return typeof raw === "string" ? raw : "";
  };

  return {
    kind: pick("kind"),
    priority: pick("priority"),
    category: pick("category"),
    brand: pick("brand"),
    region: pick("region"),
    active: pick("active"),
    q: pick("q"),
  };
}

export function toSupplierListFilters(
  values: SupplierListFilterValues,
): SupplierListFilters {
  const kind = values.kind.trim();
  const priority = values.priority.trim();
  const active = values.active.trim();

  return {
    supplierKind:
      kind !== "" && (SUPPLIER_KINDS as readonly string[]).includes(kind)
        ? (kind as SupplierKind)
        : null,
    wavePriority:
      priority !== "" &&
      (WAVE_PRIORITIES as readonly string[]).includes(priority)
        ? (priority as WavePriority)
        : null,
    categoryId: values.category.trim() || null,
    brandId: values.brand.trim() || null,
    region: values.region.trim() || null,
    isActive:
      active === "true" ? true : active === "false" ? false : null,
    search: values.q.trim() || null,
  };
}

import { redirect } from "next/navigation";

import {
  listProductCatalog,
  listSupplierRegions,
  listSuppliers,
} from "@/actions/supplier-org";
import { SupplierOrgCreateForm } from "@/components/admin/supplier-org-create-form";
import { SupplierOrgList } from "@/components/admin/supplier-org-list";
import { getProfile, homeRouteForRole } from "@/lib/auth";
import { canAccessSupplierOrgAdmin } from "@/lib/supplier-org-access";
import {
  filtersFromSearchParams,
  toSupplierListFilters,
} from "@/lib/supplier-list-filters";

interface AdminSuppliersPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * Supplier organization list (F012 / SRC-708): table, filters, search.
 * Access: admin and senior_procurement (Option A — procurement excluded).
 */
export default async function AdminSuppliersPage({
  searchParams,
}: AdminSuppliersPageProps) {
  const profile = await getProfile();
  if (!profile || !canAccessSupplierOrgAdmin(profile.role)) {
    redirect(profile ? homeRouteForRole(profile.role) : "/login");
  }

  const params = await searchParams;
  const filterValues = filtersFromSearchParams(params);
  const filters = toSupplierListFilters(filterValues);

  const [listResult, catalogResult, regionsResult] = await Promise.all([
    listSuppliers(filters),
    listProductCatalog(),
    listSupplierRegions(),
  ]);

  const categories =
    catalogResult.ok ? catalogResult.categories : [];
  const brands = catalogResult.ok ? catalogResult.brands : [];
  const regions = regionsResult.ok ? regionsResult.regions : [];

  const listError =
    !listResult.ok
      ? listResult.error
      : !catalogResult.ok
        ? catalogResult.error
        : !regionsResult.ok
          ? regionsResult.error
          : null;

  return (
    <div className="flex flex-col gap-6">
      <SupplierOrgCreateForm />
      <SupplierOrgList
        suppliers={listResult.ok ? listResult.suppliers : []}
        categories={categories}
        brands={brands}
        regions={regions}
        filters={filterValues}
        error={listError}
      />
    </div>
  );
}

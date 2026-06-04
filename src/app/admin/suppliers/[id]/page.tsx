import { notFound, redirect } from "next/navigation";

import {
  getSupplierOrgPage,
  listProductCatalog,
  listSupplierUserOptions,
} from "@/actions/supplier-org";
import { SupplierOrgDetail } from "@/components/admin/supplier-org-detail";
import { getProfile, homeRouteForRole } from "@/lib/auth";
import {
  canAccessSupplierOrgAdmin,
  canDeleteSupplierOrg,
  canWriteSupplierOrg,
} from "@/lib/supplier-org-access";

interface AdminSupplierDetailPageProps {
  params: Promise<{ id: string }>;
}

/**
 * Supplier organization card with tabs (F012 / SRC-709).
 * Access: admin and senior_procurement only (Option A).
 */
export default async function AdminSupplierDetailPage({
  params,
}: AdminSupplierDetailPageProps) {
  const profile = await getProfile();
  if (!profile || !canAccessSupplierOrgAdmin(profile.role)) {
    redirect(profile ? homeRouteForRole(profile.role) : "/login");
  }

  const { id } = await params;
  const [pageResult, catalogResult, usersResult] = await Promise.all([
    getSupplierOrgPage(id),
    listProductCatalog(),
    listSupplierUserOptions(),
  ]);

  if (!pageResult.ok) {
    notFound();
  }

  const categories = catalogResult.ok ? catalogResult.categories : [];
  const brands = catalogResult.ok ? catalogResult.brands : [];
  const availableUsers = usersResult.ok ? usersResult.users : [];

  return (
    <SupplierOrgDetail
      data={pageResult.data}
      categories={categories}
      brands={brands}
      availableUsers={availableUsers}
      canWrite={canWriteSupplierOrg(profile.role)}
      canDelete={canDeleteSupplierOrg(profile.role)}
    />
  );
}

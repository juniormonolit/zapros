import type { SourcingStatus } from "@/lib/sourcing";

/**
 * Shared types and form state for the admin catalog UI.
 * Kept outside `"use server"` files — Next.js only allows async function exports there.
 */

export interface Supplier {
  id: string;
  name: string;
  is_active: boolean;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
  sourcing_status: SourcingStatus;
  works_in_zapros: boolean;
  created_at: string;
}

export interface SupplierGroup {
  id: string;
  name: string;
  sort_order: number;
  created_at: string;
}

export interface SupplierGroupMember {
  group_id: string;
  supplier_id: string;
}

export interface BitrixSetting {
  id: string;
  name: string;
  url_template: string;
  is_active: boolean;
  created_at: string;
}

export interface CatalogActionState {
  error: string | null;
  ok: boolean;
}

/** Initial state for a freshly mounted catalog form. */
export const initialCatalogState: CatalogActionState = {
  error: null,
  ok: false,
};

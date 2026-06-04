import type { SourcingStatus } from "@/lib/sourcing";

/**
 * Types for supplier organization server actions (F012 / SRC-706).
 * Kept outside `"use server"` files — Next.js only allows async exports there.
 */

export const SUPPLIER_KINDS = [
  "manufacturer",
  "dealer",
  "carrier",
  "mixed",
] as const;
export type SupplierKind = (typeof SUPPLIER_KINDS)[number];

export const WAVE_PRIORITIES = [
  "favorite",
  "verified",
  "normal",
  "reserve",
  "stop_list",
] as const;
export type WavePriority = (typeof WAVE_PRIORITIES)[number];

export const SUPPLIER_MEMBER_ROLES = [
  "supplier_admin",
  "supplier_user",
] as const;
export type SupplierMemberRole = (typeof SUPPLIER_MEMBER_ROLES)[number];

export const VEHICLE_TYPES = [
  "manipulator",
  "truck",
  "semitrailer",
  "dump_truck",
  "tonar",
  "gazelle",
  "other",
] as const;
export type SupplierVehicleType = (typeof VEHICLE_TYPES)[number];

export const PRICE_MODELS = [
  "fixed",
  "per_km",
  "per_hour",
  "negotiable",
] as const;
export type SupplierPriceModel = (typeof PRICE_MODELS)[number];

export const AVAILABILITY_STATUSES = [
  "available",
  "busy",
  "unknown",
] as const;
export type SupplierAvailabilityStatus = (typeof AVAILABILITY_STATUSES)[number];

export const NOTIFICATION_CHANNELS = [
  "email",
  "telegram",
  "whatsapp",
  "cabinet",
] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export interface SupplierOrgActionState {
  error: string | null;
  ok: boolean;
  /** Set after createSupplierOrg for redirect to the new card. */
  supplierId?: string;
}

export const initialSupplierOrgState: SupplierOrgActionState = {
  error: null,
  ok: false,
};

/** Filters for {@link listSuppliers} (SRC-706; SRC-707 search). */
export interface SupplierListFilters {
  supplierKind?: SupplierKind | null;
  wavePriority?: WavePriority | null;
  categoryId?: string | null;
  brandId?: string | null;
  region?: string | null;
  isActive?: boolean | null;
  /** ILIKE on name, phone, contact_person; brand names via junction (F012). */
  search?: string | null;
}

/** Row returned by list/detail queries for internal admin UI. */
export interface SupplierOrgListItem {
  id: string;
  name: string;
  is_active: boolean;
  supplier_kind: SupplierKind | null;
  wave_priority: WavePriority;
  regions: string[];
  sourcing_status: SourcingStatus;
  works_in_zapros: boolean;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  created_at: string;
  category_ids: string[];
  brand_ids: string[];
}

/** Full supplier org card (master + terms + notifications). */
export interface SupplierOrgDetail extends SupplierOrgListItem {
  notes: string | null;
  share_team_responses: boolean;
  notification_channels: NotificationChannel[];
  works_with_vat: boolean | null;
  payment_deferral_days: number | null;
  min_order_amount: number | null;
  delivery_available: boolean | null;
  pickup_available: boolean | null;
  terms_comment: string | null;
}

export interface SupplierMemberRow {
  id: string;
  user_id: string;
  supplier_id: string;
  member_role: SupplierMemberRole;
  is_active: boolean;
  notification_channels: NotificationChannel[] | null;
  created_at: string;
  updated_at: string;
}

export interface SupplierSiteRow {
  id: string;
  supplier_id: string;
  name: string;
  address: string | null;
  region: string | null;
  latitude: number | null;
  longitude: number | null;
  contact_name: string | null;
  phone: string | null;
  working_hours: string | null;
  loading_conditions: string | null;
  comment: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface SupplierWarehouseRow extends SupplierSiteRow {
  pickup_available: boolean;
  delivery_available: boolean;
}

export interface SupplierVehicleRow {
  id: string;
  supplier_id: string;
  title: string;
  vehicle_type: SupplierVehicleType;
  payload_tons: number | null;
  volume_m3: number | null;
  body_length_m: number | null;
  region: string | null;
  price_model: SupplierPriceModel | null;
  base_price: number | null;
  availability_status: SupplierAvailabilityStatus;
  comment: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type ListSuppliersResult =
  | { ok: true; suppliers: SupplierOrgListItem[] }
  | { ok: false; error: string };

export type GetSupplierOrgResult =
  | { ok: true; supplier: SupplierOrgDetail }
  | { ok: false; error: string };

export interface ProductCatalogItem {
  id: string;
  name: string;
}

export interface SupplierMemberWithProfile extends SupplierMemberRow {
  email: string | null;
  full_name: string | null;
}

export interface SupplierOrgPageData {
  supplier: SupplierOrgDetail;
  members: SupplierMemberWithProfile[];
  warehouses: SupplierWarehouseRow[];
  productions: SupplierSiteRow[];
  vehicles: SupplierVehicleRow[];
}

export type GetSupplierOrgPageResult =
  | { ok: true; data: SupplierOrgPageData }
  | { ok: false; error: string };

export type ListProductCatalogResult =
  | { ok: true; categories: ProductCatalogItem[]; brands: ProductCatalogItem[] }
  | { ok: false; error: string };

export type ListSupplierRegionsResult =
  | { ok: true; regions: string[] }
  | { ok: false; error: string };

export interface SupplierUserOption {
  id: string;
  email: string | null;
  full_name: string | null;
}

export type ListSupplierUserOptionsResult =
  | { ok: true; users: SupplierUserOption[] }
  | { ok: false; error: string };

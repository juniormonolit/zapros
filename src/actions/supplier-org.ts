"use server";

import "server-only";

import { revalidatePath } from "next/cache";

import type {
  NotificationChannel,
  SupplierAvailabilityStatus,
  SupplierKind,
  SupplierListFilters,
  SupplierMemberRole,
  SupplierOrgActionState,
  SupplierOrgDetail,
  SupplierOrgListItem,
  SupplierPriceModel,
  SupplierVehicleType,
  WavePriority,
  GetSupplierOrgPageResult,
  GetSupplierOrgResult,
  ListProductCatalogResult,
  ListSupplierRegionsResult,
  ListSupplierUserOptionsResult,
  ListSuppliersResult,
  ProductCatalogItem,
  SupplierMemberWithProfile,
  SupplierOrgPageData,
  SupplierUserOption,
} from "@/actions/supplier-org-types";
import {
  AVAILABILITY_STATUSES,
  NOTIFICATION_CHANNELS,
  PRICE_MODELS,
  SUPPLIER_KINDS,
  SUPPLIER_MEMBER_ROLES,
  VEHICLE_TYPES,
  WAVE_PRIORITIES,
} from "@/actions/supplier-org-types";
import { getEffectiveProfile } from "@/lib/auth";
import { ensureRow, ensureRows, type DbRow } from "@/lib/db/types";
import { createClient } from "@/lib/app-client";
import {
  normalizeSearchTerm,
  supplierRowMatchesSearch,
} from "@/lib/supplier-list-search";
import {
  DEFAULT_SOURCING_STATUS,
  deriveWorksInZapros,
  isSourcingStatus,
  type SourcingStatus,
} from "@/lib/sourcing";

const ADMIN_SUPPLIERS_PATH = "/admin/suppliers";
const SOURCING_PATH = "/sourcing";

const ORG_LIST_COLUMNS =
  "id, name, is_active, supplier_kind, wave_priority, regions, sourcing_status, works_in_zapros, contact_person, phone, email, created_at";

const ORG_DETAIL_COLUMNS = `${ORG_LIST_COLUMNS}, notes, share_team_responses, notification_channels, works_with_vat, payment_deferral_days, min_order_amount, delivery_available, pickup_available, terms_comment`;

function ok(): SupplierOrgActionState {
  return { error: null, ok: true };
}

function fail(message: string): SupplierOrgActionState {
  return { error: message, ok: false };
}

function emptyToNull(raw: FormDataEntryValue | null): string | null {
  const value = String(raw ?? "").trim();
  return value === "" ? null : value;
}

function parseCheckbox(formData: FormData, name: string): boolean {
  return formData.get(name) !== null;
}

function parseOptionalBoolean(
  formData: FormData,
  name: string,
): boolean | null {
  const raw = formData.get(name);
  if (raw === null) return null;
  const value = String(raw).trim();
  if (value === "") return null;
  if (value === "true" || value === "1") return true;
  if (value === "false" || value === "0") return false;
  return null;
}

function parseOptionalInt(
  formData: FormData,
  name: string,
): { value: number | null } | { error: string } {
  const raw = String(formData.get(name) ?? "").trim();
  if (raw === "") return { value: null };
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 0) {
    return { error: "Укажите целое неотрицательное число." };
  }
  return { value: parsed };
}

function parseOptionalNumeric(
  formData: FormData,
  name: string,
): { value: number | null } | { error: string } {
  const raw = String(formData.get(name) ?? "").trim();
  if (raw === "") return { value: null };
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return { error: "Укажите корректное неотрицательное число." };
  }
  return { value: parsed };
}

function parseRegions(formData: FormData): string[] {
  const fromList = formData
    .getAll("region")
    .map((v) => String(v).trim())
    .filter(Boolean);
  if (fromList.length > 0) return [...new Set(fromList)];

  const combined = String(formData.get("regions") ?? "").trim();
  if (!combined) return [];
  return [
    ...new Set(
      combined
        .split(/[,;]/)
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  ];
}

function parseNotificationChannels(
  formData: FormData,
): NotificationChannel[] {
  const selected = formData
    .getAll("notification_channel")
    .map((v) => String(v).trim());
  const valid = new Set<string>(NOTIFICATION_CHANNELS);
  return [
    ...new Set(
      selected.filter((ch): ch is NotificationChannel =>
        valid.has(ch),
      ),
    ),
  ];
}

function parseUuidList(formData: FormData, name: string): string[] {
  return [
    ...new Set(
      formData
        .getAll(name)
        .map((v) => String(v).trim())
        .filter(Boolean),
    ),
  ];
}

function isSupplierKind(value: string): value is SupplierKind {
  return (SUPPLIER_KINDS as readonly string[]).includes(value);
}

function isWavePriority(value: string): value is WavePriority {
  return (WAVE_PRIORITIES as readonly string[]).includes(value);
}

function isMemberRole(value: string): value is SupplierMemberRole {
  return (SUPPLIER_MEMBER_ROLES as readonly string[]).includes(value);
}

function isVehicleType(value: string): value is SupplierVehicleType {
  return (VEHICLE_TYPES as readonly string[]).includes(value);
}

function isPriceModel(value: string): value is SupplierPriceModel {
  return (PRICE_MODELS as readonly string[]).includes(value);
}

function isAvailabilityStatus(
  value: string,
): value is SupplierAvailabilityStatus {
  return (AVAILABILITY_STATUSES as readonly string[]).includes(value);
}

function revalidateSupplierPaths(supplierId?: string) {
  revalidatePath(ADMIN_SUPPLIERS_PATH);
  revalidatePath(SOURCING_PATH);
  if (supplierId) {
    revalidatePath(`${ADMIN_SUPPLIERS_PATH}/${supplierId}`);
  }
}

/**
 * Writes: admin or senior_procurement (defense in depth; RLS enforces too).
 */
async function denyNonOrgWriter(): Promise<string | null> {
  const profile = await getEffectiveProfile();
  if (!profile) return "Необходима авторизация.";
  if (profile.role !== "admin" && profile.role !== "senior_procurement") {
    return "Недостаточно прав для выполнения операции.";
  }
  return null;
}

/**
 * Reads: admin, senior_procurement, or procurement (Option A).
 */
async function denyNonOrgReader(): Promise<string | null> {
  const profile = await getEffectiveProfile();
  if (!profile) return "Необходима авторизация.";
  if (
    profile.role !== "admin" &&
    profile.role !== "senior_procurement" &&
    profile.role !== "procurement"
  ) {
    return "Недостаточно прав для просмотра.";
  }
  return null;
}

async function denyNonAdmin(): Promise<string | null> {
  const profile = await getEffectiveProfile();
  if (!profile) return "Необходима авторизация.";
  if (profile.role !== "admin") {
    return "Недостаточно прав для выполнения операции.";
  }
  return null;
}

interface SupplierOrgFields {
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
  sourcing_status: SourcingStatus;
  works_in_zapros: boolean;
  supplier_kind: SupplierKind | null;
  wave_priority: WavePriority;
  regions: string[];
  share_team_responses: boolean;
  notification_channels: NotificationChannel[];
  works_with_vat: boolean | null;
  payment_deferral_days: number | null;
  min_order_amount: number | null;
  delivery_available: boolean | null;
  pickup_available: boolean | null;
  terms_comment: string | null;
}

function readSupplierOrgFields(
  formData: FormData,
):
  | { error: SupplierOrgActionState }
  | SupplierOrgFields {
  const status = String(
    formData.get("sourcing_status") ?? DEFAULT_SOURCING_STATUS,
  ).trim();
  if (!isSourcingStatus(status)) {
    return { error: fail("Выберите корректную стадию поставщика.") };
  }

  const kindRaw = String(formData.get("supplier_kind") ?? "").trim();
  let supplier_kind: SupplierKind | null = null;
  if (kindRaw !== "") {
    if (!isSupplierKind(kindRaw)) {
      return { error: fail("Выберите корректный тип поставщика.") };
    }
    supplier_kind = kindRaw;
  }

  const priorityRaw = String(
    formData.get("wave_priority") ?? "normal",
  ).trim();
  if (!isWavePriority(priorityRaw)) {
    return { error: fail("Выберите корректный приоритет.") };
  }

  const deferral = parseOptionalInt(formData, "payment_deferral_days");
  if ("error" in deferral) {
    return { error: fail(deferral.error) };
  }

  const minOrder = parseOptionalNumeric(formData, "min_order_amount");
  if ("error" in minOrder) {
    return { error: fail(minOrder.error) };
  }

  return {
    contact_person: emptyToNull(formData.get("contact_person")),
    phone: emptyToNull(formData.get("phone")),
    email: emptyToNull(formData.get("email")),
    notes: emptyToNull(formData.get("notes")),
    sourcing_status: status,
    works_in_zapros: deriveWorksInZapros(status),
    supplier_kind,
    wave_priority: priorityRaw,
    regions: parseRegions(formData),
    share_team_responses: parseCheckbox(formData, "share_team_responses"),
    notification_channels: parseNotificationChannels(formData),
    works_with_vat: parseOptionalBoolean(formData, "works_with_vat"),
    payment_deferral_days: deferral.value,
    min_order_amount: minOrder.value,
    delivery_available: parseOptionalBoolean(formData, "delivery_available"),
    pickup_available: parseOptionalBoolean(formData, "pickup_available"),
    terms_comment: emptyToNull(formData.get("terms_comment")),
  };
}

interface SiteFields {
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
}

function readSiteFields(
  formData: FormData,
): { error: SupplierOrgActionState } | SiteFields {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) {
    return { error: fail("Введите название.") };
  }

  const lat = parseOptionalNumeric(formData, "latitude");
  if ("error" in lat) return { error: fail(lat.error) };
  const lng = parseOptionalNumeric(formData, "longitude");
  if ("error" in lng) return { error: fail(lng.error) };

  return {
    name,
    address: emptyToNull(formData.get("address")),
    region: emptyToNull(formData.get("region")),
    latitude: lat.value,
    longitude: lng.value,
    contact_name: emptyToNull(formData.get("contact_name")),
    phone: emptyToNull(formData.get("phone")),
    working_hours: emptyToNull(formData.get("working_hours")),
    loading_conditions: emptyToNull(formData.get("loading_conditions")),
    comment: emptyToNull(formData.get("comment")),
  };
}

interface JunctionMaps {
  categories: Map<string, string[]>;
  brands: Map<string, string[]>;
}

async function loadJunctionMaps(
  supplierIds: string[],
): Promise<JunctionMaps> {
  const categories = new Map<string, string[]>();
  const brands = new Map<string, string[]>();
  if (supplierIds.length === 0) {
    return { categories, brands };
  }

  const supabase = await createClient();
  const [catResult, brandResult] = await Promise.all([
    supabase
      .from("supplier_categories")
      .select("supplier_id, category_id")
      .in("supplier_id", supplierIds),
    supabase
      .from("supplier_brands")
      .select("supplier_id, brand_id")
      .in("supplier_id", supplierIds),
  ]);

  for (const row of ensureRows(catResult.data)) {
    const supplierId = String(row.supplier_id);
    const list = categories.get(supplierId) ?? [];
    list.push(String(row.category_id));
    categories.set(supplierId, list);
  }

  for (const row of ensureRows(brandResult.data)) {
    const supplierId = String(row.supplier_id);
    const list = brands.get(supplierId) ?? [];
    list.push(String(row.brand_id));
    brands.set(supplierId, list);
  }

  return { categories, brands };
}

async function supplierIdsMatchingJunction(
  table: "supplier_categories" | "supplier_brands",
  idColumn: "category_id" | "brand_id",
  id: string,
): Promise<string[] | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from(table)
    .select("supplier_id")
    .eq(idColumn, id);
  if (error) return null;
  return ensureRows(data).map((row) => String(row.supplier_id));
}

async function supplierIdsMatchingBrandSearch(
  term: string,
): Promise<string[] | null> {
  const supabase = await createClient();
  const needle = term.toLowerCase();

  const { data: brands, error: brandError } = await supabase
    .from("product_brands")
    .select("id, name")
    .eq("is_active", true);
  if (brandError) return null;

  const brandIds = ensureRows(brands)
    .filter((row) =>
      String(row.name ?? "")
        .toLowerCase()
        .includes(needle),
    )
    .map((row) => String(row.id));
  if (brandIds.length === 0) return [];

  const { data: junctions, error: junctionError } = await supabase
    .from("supplier_brands")
    .select("supplier_id")
    .in("brand_id", brandIds);
  if (junctionError) return null;

  return [
    ...new Set(ensureRows(junctions).map((row) => String(row.supplier_id))),
  ];
}

function mapListRow(
  row: Record<string, unknown>,
  junctions: JunctionMaps,
): SupplierOrgListItem {
  const id = String(row.id);
  return {
    id,
    name: String(row.name),
    is_active: Boolean(row.is_active),
    supplier_kind: (row.supplier_kind as SupplierKind | null) ?? null,
    wave_priority: row.wave_priority as WavePriority,
    regions: Array.isArray(row.regions)
      ? (row.regions as string[])
      : [],
    sourcing_status: row.sourcing_status as SourcingStatus,
    works_in_zapros: Boolean(row.works_in_zapros),
    contact_person: (row.contact_person as string | null) ?? null,
    phone: (row.phone as string | null) ?? null,
    email: (row.email as string | null) ?? null,
    created_at: String(row.created_at),
    category_ids: junctions.categories.get(id) ?? [],
    brand_ids: junctions.brands.get(id) ?? [],
  };
}

function mapDetailRow(
  row: Record<string, unknown>,
  junctions: JunctionMaps,
): SupplierOrgDetail {
  const base = mapListRow(row, junctions);
  const channels = Array.isArray(row.notification_channels)
    ? (row.notification_channels as string[]).filter((ch): ch is NotificationChannel =>
        (NOTIFICATION_CHANNELS as readonly string[]).includes(ch),
      )
    : [];

  return {
    ...base,
    notes: (row.notes as string | null) ?? null,
    share_team_responses: Boolean(row.share_team_responses),
    notification_channels: channels,
    works_with_vat: (row.works_with_vat as boolean | null) ?? null,
    payment_deferral_days:
      row.payment_deferral_days === null ||
      row.payment_deferral_days === undefined
        ? null
        : Number(row.payment_deferral_days),
    min_order_amount:
      row.min_order_amount === null || row.min_order_amount === undefined
        ? null
        : Number(row.min_order_amount),
    delivery_available: (row.delivery_available as boolean | null) ?? null,
    pickup_available: (row.pickup_available as boolean | null) ?? null,
    terms_comment: (row.terms_comment as string | null) ?? null,
  };
}

async function syncSupplierJunction(
  table: "supplier_categories" | "supplier_brands",
  idColumn: "category_id" | "brand_id",
  supplierId: string,
  selected: Set<string>,
): Promise<SupplierOrgActionState | null> {
  const supabase = await createClient();
  const { data: current, error: readError } = await supabase
    .from(table)
    .select(idColumn)
    .eq("supplier_id", supplierId);

  if (readError) {
    return fail("Не удалось загрузить привязки поставщика.");
  }

  const existing = new Set(
    ensureRows(current).map((row) =>
      String((row as Record<string, unknown>)[idColumn]),
    ),
  );

  const toAdd = [...selected].filter((id) => !existing.has(id));
  const toRemove = [...existing].filter((id) => !selected.has(id));

  if (toRemove.length > 0) {
    const { error } = await supabase
      .from(table)
      .delete()
      .eq("supplier_id", supplierId)
      .in(idColumn, toRemove);
    if (error) {
      return fail("Не удалось обновить привязки поставщика.");
    }
  }

  if (toAdd.length > 0) {
    const rows = toAdd.map((id) => ({
      supplier_id: supplierId,
      [idColumn]: id,
    }));
    const { error } = await supabase.from(table).insert(rows);
    if (error) {
      return fail("Не удалось обновить привязки поставщика.");
    }
  }

  return null;
}

async function applySupplierJunctions(
  supplierId: string,
  formData: FormData,
): Promise<SupplierOrgActionState | null> {
  const categoryIds = new Set(parseUuidList(formData, "categoryId"));
  const brandIds = new Set(parseUuidList(formData, "brandId"));

  const catError = await syncSupplierJunction(
    "supplier_categories",
    "category_id",
    supplierId,
    categoryIds,
  );
  if (catError) return catError;

  return syncSupplierJunction(
    "supplier_brands",
    "brand_id",
    supplierId,
    brandIds,
  );
}

/* -------------------------------------------------------------------------- */
/* Queries                                                                     */
/* -------------------------------------------------------------------------- */

export async function listSuppliers(
  filters: SupplierListFilters = {},
): Promise<ListSuppliersResult> {
  const denied = await denyNonOrgReader();
  if (denied) return { ok: false, error: denied };

  let idFilter: string[] | null = null;
  if (filters.categoryId) {
    const ids = await supplierIdsMatchingJunction(
      "supplier_categories",
      "category_id",
      filters.categoryId,
    );
    if (ids === null) {
      return { ok: false, error: "Не удалось загрузить список поставщиков." };
    }
    idFilter = intersectIds(idFilter, ids);
    if (idFilter.length === 0) {
      return { ok: true, suppliers: [] };
    }
  }
  if (filters.brandId) {
    const ids = await supplierIdsMatchingJunction(
      "supplier_brands",
      "brand_id",
      filters.brandId,
    );
    if (ids === null) {
      return { ok: false, error: "Не удалось загрузить список поставщиков." };
    }
    idFilter = intersectIds(idFilter, ids);
    if (idFilter.length === 0) {
      return { ok: true, suppliers: [] };
    }
  }

  const supabase = await createClient();
  const query = supabase.from("suppliers").select(ORG_LIST_COLUMNS);

  if (idFilter) {
    query.in("id", idFilter);
  }
  if (filters.supplierKind) {
    query.eq("supplier_kind", filters.supplierKind);
  }
  if (filters.wavePriority) {
    query.eq("wave_priority", filters.wavePriority);
  }
  if (filters.isActive !== null && filters.isActive !== undefined) {
    query.eq("is_active", filters.isActive);
  }
  if (filters.region) {
    query.contains("regions", [filters.region]);
  }

  const searchTerm = normalizeSearchTerm(filters.search);
  let brandSupplierIds: string[] = [];
  if (searchTerm) {
    const ids = await supplierIdsMatchingBrandSearch(searchTerm);
    if (ids === null) {
      return { ok: false, error: "Не удалось загрузить список поставщиков." };
    }
    brandSupplierIds = ids;
  }

  const { data, error } = await query.order("name", { ascending: true });
  if (error) {
    return { ok: false, error: "Не удалось загрузить список поставщиков." };
  }

  let rows = ensureRows(data);
  if (searchTerm) {
    const brandIdSet = new Set(brandSupplierIds);
    rows = rows.filter((row) => {
      const record = row as Record<string, unknown>;
      const id = String(record.id);
      if (brandIdSet.has(id)) return true;
      return supplierRowMatchesSearch(
        {
          name: String(record.name),
          phone: (record.phone as string | null) ?? null,
          contact_person: (record.contact_person as string | null) ?? null,
        },
        searchTerm,
      );
    });
  }
  const junctions = await loadJunctionMaps(
    rows.map((row) => String(row.id)),
  );
  const suppliers = rows.map((row) =>
    mapListRow(row as Record<string, unknown>, junctions),
  );
  return { ok: true, suppliers };
}

function intersectIds(
  current: string[] | null,
  next: string[],
): string[] {
  if (current === null) return next;
  const allowed = new Set(current);
  return next.filter((id) => allowed.has(id));
}

export async function listProductCatalog(): Promise<ListProductCatalogResult> {
  const denied = await denyNonOrgReader();
  if (denied) return { ok: false, error: denied };

  const supabase = await createClient();
  const [categoriesResult, brandsResult] = await Promise.all([
    supabase
      .from("product_categories")
      .select("id, name")
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
    supabase
      .from("product_brands")
      .select("id, name")
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
  ]);

  if (categoriesResult.error || brandsResult.error) {
    return { ok: false, error: "Не удалось загрузить справочники." };
  }

  const mapCatalog = (rows: DbRow | DbRow[] | null | undefined): ProductCatalogItem[] =>
    ensureRows(rows).map((row) => ({
      id: String(row.id),
      name: String(row.name),
    }));

  return {
    ok: true,
    categories: mapCatalog(categoriesResult.data),
    brands: mapCatalog(brandsResult.data),
  };
}

export async function listSupplierRegions(): Promise<ListSupplierRegionsResult> {
  const denied = await denyNonOrgReader();
  if (denied) return { ok: false, error: denied };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("suppliers")
    .select("regions")
    .not("regions", "is", null);

  if (error) {
    return { ok: false, error: "Не удалось загрузить регионы." };
  }

  const regionSet = new Set<string>();
  for (const row of ensureRows(data)) {
    const regions = (row as { regions: string[] | null }).regions;
    if (Array.isArray(regions)) {
      for (const region of regions) {
        const trimmed = String(region).trim();
        if (trimmed) regionSet.add(trimmed);
      }
    }
  }

  return {
    ok: true,
    regions: [...regionSet].sort((a, b) => a.localeCompare(b, "ru")),
  };
}

export async function getSupplierOrgPage(
  supplierId: string,
): Promise<GetSupplierOrgPageResult> {
  const supplierResult = await getSupplierOrg(supplierId);
  if (!supplierResult.ok) {
    return { ok: false, error: supplierResult.error };
  }

  const supabase = await createClient();
  const [membersResult, warehousesResult, productionsResult, vehiclesResult] =
    await Promise.all([
      supabase
        .from("supplier_members")
        .select(
          "id, user_id, supplier_id, member_role, is_active, notification_channels, created_at, updated_at",
        )
        .eq("supplier_id", supplierId)
        .order("created_at", { ascending: true }),
      supabase
        .from("supplier_warehouses")
        .select("*")
        .eq("supplier_id", supplierId)
        .order("name", { ascending: true }),
      supabase
        .from("supplier_productions")
        .select("*")
        .eq("supplier_id", supplierId)
        .order("name", { ascending: true }),
      supabase
        .from("supplier_vehicles")
        .select("*")
        .eq("supplier_id", supplierId)
        .order("title", { ascending: true }),
    ]);

  if (
    membersResult.error ||
    warehousesResult.error ||
    productionsResult.error ||
    vehiclesResult.error
  ) {
    return { ok: false, error: "Не удалось загрузить данные поставщика." };
  }

  const memberRows = ensureRows(membersResult.data);
  const userIds = memberRows.map((row) => String(row.user_id));
  const profileByUserId = new Map<
    string,
    { email: string | null; full_name: string | null }
  >();

  if (userIds.length > 0) {
    const { data: profiles, error: profilesError } = await supabase
      .from("profiles")
      .select("id, email, full_name")
      .in("id", userIds);
    if (profilesError) {
      return { ok: false, error: "Не удалось загрузить данные поставщика." };
    }
    for (const profile of ensureRows(profiles)) {
      profileByUserId.set(String(profile.id), {
        email: (profile.email as string | null) ?? null,
        full_name: (profile.full_name as string | null) ?? null,
      });
    }
  }

  const members: SupplierMemberWithProfile[] = memberRows.map((row) => {
    const record = row as Record<string, unknown>;
    const profile = profileByUserId.get(String(record.user_id));
    return {
      id: String(record.id),
      user_id: String(record.user_id),
      supplier_id: String(record.supplier_id),
      member_role: record.member_role as SupplierMemberWithProfile["member_role"],
      is_active: Boolean(record.is_active),
      notification_channels: Array.isArray(record.notification_channels)
        ? (record.notification_channels as SupplierMemberWithProfile["notification_channels"])
        : null,
      created_at: String(record.created_at),
      updated_at: String(record.updated_at),
      email: profile?.email ?? null,
      full_name: profile?.full_name ?? null,
    };
  });

  const data: SupplierOrgPageData = {
    supplier: supplierResult.supplier,
    members,
    warehouses: ensureRows(warehousesResult.data) as unknown as SupplierOrgPageData["warehouses"],
    productions: ensureRows(productionsResult.data) as unknown as SupplierOrgPageData["productions"],
    vehicles: ensureRows(vehiclesResult.data) as unknown as SupplierOrgPageData["vehicles"],
  };

  return { ok: true, data };
}

export async function listSupplierUserOptions(): Promise<ListSupplierUserOptionsResult> {
  const denied = await denyNonOrgWriter();
  if (denied) return { ok: false, error: denied };

  const supabase = await createClient();
  const { data: members, error: membersError } = await supabase
    .from("supplier_members")
    .select("user_id");
  if (membersError) {
    return { ok: false, error: "Не удалось загрузить пользователей." };
  }

  const assigned = new Set(
    ensureRows(members).map((row) => String(row.user_id)),
  );

  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select("id, email, full_name")
    .eq("role", "supplier")
    .eq("is_active", true)
    .order("email", { ascending: true });

  if (profilesError) {
    return { ok: false, error: "Не удалось загрузить пользователей." };
  }

  const users: SupplierUserOption[] = ensureRows(profiles)
    .filter((row) => !assigned.has(String(row.id)))
    .map((row) => ({
      id: String(row.id),
      email: (row.email as string | null) ?? null,
      full_name: (row.full_name as string | null) ?? null,
    }));

  return { ok: true, users };
}

export async function getSupplierOrg(
  supplierId: string,
): Promise<GetSupplierOrgResult> {
  const denied = await denyNonOrgReader();
  if (denied) return { ok: false, error: denied };
  if (!supplierId) {
    return { ok: false, error: "Поставщик не найден." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("suppliers")
    .select(ORG_DETAIL_COLUMNS)
    .eq("id", supplierId)
    .maybeSingle();

  const row = ensureRow(data);
  if (error || !row) {
    return { ok: false, error: "Поставщик не найден или нет доступа." };
  }

  const junctions = await loadJunctionMaps([supplierId]);
  return {
    ok: true,
    supplier: mapDetailRow(row as Record<string, unknown>, junctions),
  };
}

/* -------------------------------------------------------------------------- */
/* Suppliers (extended org fields + junctions)                                 */
/* -------------------------------------------------------------------------- */

export async function createSupplierOrg(
  _prev: SupplierOrgActionState,
  formData: FormData,
): Promise<SupplierOrgActionState> {
  const denied = await denyNonOrgWriter();
  if (denied) return fail(denied);

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return fail("Введите название поставщика.");

  const fields = readSupplierOrgFields(formData);
  if ("error" in fields) return fields.error;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("suppliers")
    .insert({ name, ...fields })
    .select("id")
    .single();

  const created = ensureRow(data);
  if (error || !created) {
    return fail("Не удалось создать поставщика.");
  }

  const supplierId = String(created.id);
  const junctionError = await applySupplierJunctions(supplierId, formData);
  if (junctionError) return junctionError;

  revalidateSupplierPaths(supplierId);
  return { error: null, ok: true, supplierId };
}

export async function updateSupplierOrg(
  _prev: SupplierOrgActionState,
  formData: FormData,
): Promise<SupplierOrgActionState> {
  const denied = await denyNonOrgWriter();
  if (denied) return fail(denied);

  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!id) return fail("Поставщик не найден.");
  if (!name) return fail("Введите название поставщика.");

  const fields = readSupplierOrgFields(formData);
  if ("error" in fields) return fields.error;

  const supabase = await createClient();
  const { error } = await supabase
    .from("suppliers")
    .update({ name, ...fields })
    .eq("id", id);
  if (error) {
    return fail("Не удалось сохранить изменения.");
  }

  const junctionError = await applySupplierJunctions(id, formData);
  if (junctionError) return junctionError;

  revalidateSupplierPaths(id);
  return ok();
}

export async function setSupplierOrgActive(
  _prev: SupplierOrgActionState,
  formData: FormData,
): Promise<SupplierOrgActionState> {
  const denied = await denyNonOrgWriter();
  if (denied) return fail(denied);

  const id = String(formData.get("id") ?? "");
  const isActive = String(formData.get("is_active") ?? "") === "true";
  if (!id) return fail("Поставщик не найден.");

  const supabase = await createClient();
  const { error } = await supabase
    .from("suppliers")
    .update({ is_active: isActive })
    .eq("id", id);
  if (error) {
    return fail("Не удалось изменить статус поставщика.");
  }

  revalidateSupplierPaths(id);
  return ok();
}

/** Hard delete — admin only (matches RLS `suppliers_delete`). */
export async function deleteSupplierOrg(
  _prev: SupplierOrgActionState,
  formData: FormData,
): Promise<SupplierOrgActionState> {
  const denied = await denyNonAdmin();
  if (denied) return fail(denied);

  const id = String(formData.get("id") ?? "");
  if (!id) return fail("Поставщик не найден.");

  const supabase = await createClient();
  const { error } = await supabase.from("suppliers").delete().eq("id", id);
  if (error) {
    return fail("Не удалось удалить поставщика.");
  }

  revalidateSupplierPaths(id);
  revalidatePath("/admin/groups");
  return ok();
}

/* -------------------------------------------------------------------------- */
/* supplier_members                                                            */
/* -------------------------------------------------------------------------- */

export async function createSupplierMember(
  _prev: SupplierOrgActionState,
  formData: FormData,
): Promise<SupplierOrgActionState> {
  const denied = await denyNonOrgWriter();
  if (denied) return fail(denied);

  const supplierId = String(formData.get("supplierId") ?? "");
  const userId = String(formData.get("userId") ?? "");
  const roleRaw = String(formData.get("member_role") ?? "supplier_admin").trim();

  if (!supplierId) return fail("Поставщик не найден.");
  if (!userId) return fail("Укажите пользователя.");
  if (!isMemberRole(roleRaw)) {
    return fail("Выберите корректную роль в организации.");
  }

  const channels = parseNotificationChannels(formData);
  const notification_channels =
    channels.length > 0 ? channels : null;

  const supabase = await createClient();
  const { error } = await supabase.from("supplier_members").insert({
    supplier_id: supplierId,
    user_id: userId,
    member_role: roleRaw,
    is_active: true,
    notification_channels,
  });

  if (error) {
    return fail("Не удалось добавить участника. Возможно, пользователь уже привязан к другой организации.");
  }

  revalidateSupplierPaths(supplierId);
  return ok();
}

export async function updateSupplierMember(
  _prev: SupplierOrgActionState,
  formData: FormData,
): Promise<SupplierOrgActionState> {
  const denied = await denyNonOrgWriter();
  if (denied) return fail(denied);

  const id = String(formData.get("id") ?? "");
  const supplierId = String(formData.get("supplierId") ?? "");
  const roleRaw = String(formData.get("member_role") ?? "").trim();

  if (!id) return fail("Участник не найден.");
  if (!isMemberRole(roleRaw)) {
    return fail("Выберите корректную роль в организации.");
  }

  const channels = parseNotificationChannels(formData);
  const notification_channels =
    channels.length > 0 ? channels : null;

  const supabase = await createClient();
  const { error } = await supabase
    .from("supplier_members")
    .update({
      member_role: roleRaw,
      notification_channels,
    })
    .eq("id", id);

  if (error) {
    return fail("Не удалось сохранить участника.");
  }

  revalidateSupplierPaths(supplierId);
  return ok();
}

export async function setSupplierMemberActive(
  _prev: SupplierOrgActionState,
  formData: FormData,
): Promise<SupplierOrgActionState> {
  const denied = await denyNonOrgWriter();
  if (denied) return fail(denied);

  const id = String(formData.get("id") ?? "");
  const supplierId = String(formData.get("supplierId") ?? "");
  const isActive = String(formData.get("is_active") ?? "") === "true";
  if (!id) return fail("Участник не найден.");

  const supabase = await createClient();
  const { error } = await supabase
    .from("supplier_members")
    .update({ is_active: isActive })
    .eq("id", id);
  if (error) {
    return fail("Не удалось изменить статус участника.");
  }

  revalidateSupplierPaths(supplierId);
  return ok();
}

export async function deleteSupplierMember(
  _prev: SupplierOrgActionState,
  formData: FormData,
): Promise<SupplierOrgActionState> {
  const denied = await denyNonOrgWriter();
  if (denied) return fail(denied);

  const id = String(formData.get("id") ?? "");
  const supplierId = String(formData.get("supplierId") ?? "");
  if (!id) return fail("Участник не найден.");

  const supabase = await createClient();
  const { error } = await supabase
    .from("supplier_members")
    .delete()
    .eq("id", id);
  if (error) {
    return fail("Не удалось удалить участника.");
  }

  revalidateSupplierPaths(supplierId);
  return ok();
}

/* -------------------------------------------------------------------------- */
/* supplier_warehouses                                                         */
/* -------------------------------------------------------------------------- */

export async function createSupplierWarehouse(
  _prev: SupplierOrgActionState,
  formData: FormData,
): Promise<SupplierOrgActionState> {
  const denied = await denyNonOrgWriter();
  if (denied) return fail(denied);

  const supplierId = String(formData.get("supplierId") ?? "");
  if (!supplierId) return fail("Поставщик не найден.");

  const site = readSiteFields(formData);
  if ("error" in site) return site.error;

  const supabase = await createClient();
  const { error } = await supabase.from("supplier_warehouses").insert({
    supplier_id: supplierId,
    ...site,
    pickup_available: parseCheckbox(formData, "pickup_available"),
    delivery_available: parseCheckbox(formData, "delivery_available"),
    is_active: true,
  });
  if (error) {
    return fail("Не удалось создать склад.");
  }

  revalidateSupplierPaths(supplierId);
  return ok();
}

export async function updateSupplierWarehouse(
  _prev: SupplierOrgActionState,
  formData: FormData,
): Promise<SupplierOrgActionState> {
  const denied = await denyNonOrgWriter();
  if (denied) return fail(denied);

  const id = String(formData.get("id") ?? "");
  const supplierId = String(formData.get("supplierId") ?? "");
  if (!id) return fail("Склад не найден.");

  const site = readSiteFields(formData);
  if ("error" in site) return site.error;

  const supabase = await createClient();
  const { error } = await supabase
    .from("supplier_warehouses")
    .update({
      ...site,
      pickup_available: parseCheckbox(formData, "pickup_available"),
      delivery_available: parseCheckbox(formData, "delivery_available"),
    })
    .eq("id", id);
  if (error) {
    return fail("Не удалось сохранить склад.");
  }

  revalidateSupplierPaths(supplierId);
  return ok();
}

export async function setSupplierWarehouseActive(
  _prev: SupplierOrgActionState,
  formData: FormData,
): Promise<SupplierOrgActionState> {
  const denied = await denyNonOrgWriter();
  if (denied) return fail(denied);

  const id = String(formData.get("id") ?? "");
  const supplierId = String(formData.get("supplierId") ?? "");
  const isActive = String(formData.get("is_active") ?? "") === "true";
  if (!id) return fail("Склад не найден.");

  const supabase = await createClient();
  const { error } = await supabase
    .from("supplier_warehouses")
    .update({ is_active: isActive })
    .eq("id", id);
  if (error) {
    return fail("Не удалось изменить статус склада.");
  }

  revalidateSupplierPaths(supplierId);
  return ok();
}

export async function deleteSupplierWarehouse(
  _prev: SupplierOrgActionState,
  formData: FormData,
): Promise<SupplierOrgActionState> {
  const denied = await denyNonOrgWriter();
  if (denied) return fail(denied);

  const id = String(formData.get("id") ?? "");
  const supplierId = String(formData.get("supplierId") ?? "");
  if (!id) return fail("Склад не найден.");

  const supabase = await createClient();
  const { error } = await supabase
    .from("supplier_warehouses")
    .delete()
    .eq("id", id);
  if (error) {
    return fail("Не удалось удалить склад.");
  }

  revalidateSupplierPaths(supplierId);
  return ok();
}

/* -------------------------------------------------------------------------- */
/* supplier_productions                                                        */
/* -------------------------------------------------------------------------- */

export async function createSupplierProduction(
  _prev: SupplierOrgActionState,
  formData: FormData,
): Promise<SupplierOrgActionState> {
  const denied = await denyNonOrgWriter();
  if (denied) return fail(denied);

  const supplierId = String(formData.get("supplierId") ?? "");
  if (!supplierId) return fail("Поставщик не найден.");

  const site = readSiteFields(formData);
  if ("error" in site) return site.error;

  const supabase = await createClient();
  const { error } = await supabase.from("supplier_productions").insert({
    supplier_id: supplierId,
    ...site,
    is_active: true,
  });
  if (error) {
    return fail("Не удалось создать производство.");
  }

  revalidateSupplierPaths(supplierId);
  return ok();
}

export async function updateSupplierProduction(
  _prev: SupplierOrgActionState,
  formData: FormData,
): Promise<SupplierOrgActionState> {
  const denied = await denyNonOrgWriter();
  if (denied) return fail(denied);

  const id = String(formData.get("id") ?? "");
  const supplierId = String(formData.get("supplierId") ?? "");
  if (!id) return fail("Производство не найдено.");

  const site = readSiteFields(formData);
  if ("error" in site) return site.error;

  const supabase = await createClient();
  const { error } = await supabase
    .from("supplier_productions")
    .update({ ...site })
    .eq("id", id);
  if (error) {
    return fail("Не удалось сохранить производство.");
  }

  revalidateSupplierPaths(supplierId);
  return ok();
}

export async function setSupplierProductionActive(
  _prev: SupplierOrgActionState,
  formData: FormData,
): Promise<SupplierOrgActionState> {
  const denied = await denyNonOrgWriter();
  if (denied) return fail(denied);

  const id = String(formData.get("id") ?? "");
  const supplierId = String(formData.get("supplierId") ?? "");
  const isActive = String(formData.get("is_active") ?? "") === "true";
  if (!id) return fail("Производство не найдено.");

  const supabase = await createClient();
  const { error } = await supabase
    .from("supplier_productions")
    .update({ is_active: isActive })
    .eq("id", id);
  if (error) {
    return fail("Не удалось изменить статус производства.");
  }

  revalidateSupplierPaths(supplierId);
  return ok();
}

export async function deleteSupplierProduction(
  _prev: SupplierOrgActionState,
  formData: FormData,
): Promise<SupplierOrgActionState> {
  const denied = await denyNonOrgWriter();
  if (denied) return fail(denied);

  const id = String(formData.get("id") ?? "");
  const supplierId = String(formData.get("supplierId") ?? "");
  if (!id) return fail("Производство не найдено.");

  const supabase = await createClient();
  const { error } = await supabase
    .from("supplier_productions")
    .delete()
    .eq("id", id);
  if (error) {
    return fail("Не удалось удалить производство.");
  }

  revalidateSupplierPaths(supplierId);
  return ok();
}

/* -------------------------------------------------------------------------- */
/* supplier_vehicles                                                           */
/* -------------------------------------------------------------------------- */

function readVehicleFields(
  formData: FormData,
):
  | { error: SupplierOrgActionState }
  | {
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
    } {
  const title = String(formData.get("title") ?? "").trim();
  if (!title) {
    return { error: fail("Введите название транспорта.") };
  }

  const typeRaw = String(formData.get("vehicle_type") ?? "").trim();
  if (!isVehicleType(typeRaw)) {
    return { error: fail("Выберите корректный тип транспорта.") };
  }

  const priceRaw = String(formData.get("price_model") ?? "").trim();
  let price_model: SupplierPriceModel | null = null;
  if (priceRaw !== "") {
    if (!isPriceModel(priceRaw)) {
      return { error: fail("Выберите корректную модель цены.") };
    }
    price_model = priceRaw;
  }

  const statusRaw = String(
    formData.get("availability_status") ?? "unknown",
  ).trim();
  if (!isAvailabilityStatus(statusRaw)) {
    return { error: fail("Выберите корректный статус доступности.") };
  }

  const payload = parseOptionalNumeric(formData, "payload_tons");
  if ("error" in payload) return { error: fail(payload.error) };
  const volume = parseOptionalNumeric(formData, "volume_m3");
  if ("error" in volume) return { error: fail(volume.error) };
  const bodyLength = parseOptionalNumeric(formData, "body_length_m");
  if ("error" in bodyLength) return { error: fail(bodyLength.error) };
  const basePrice = parseOptionalNumeric(formData, "base_price");
  if ("error" in basePrice) return { error: fail(basePrice.error) };

  return {
    title,
    vehicle_type: typeRaw,
    payload_tons: payload.value,
    volume_m3: volume.value,
    body_length_m: bodyLength.value,
    region: emptyToNull(formData.get("region")),
    price_model,
    base_price: basePrice.value,
    availability_status: statusRaw,
    comment: emptyToNull(formData.get("comment")),
  };
}

export async function createSupplierVehicle(
  _prev: SupplierOrgActionState,
  formData: FormData,
): Promise<SupplierOrgActionState> {
  const denied = await denyNonOrgWriter();
  if (denied) return fail(denied);

  const supplierId = String(formData.get("supplierId") ?? "");
  if (!supplierId) return fail("Поставщик не найден.");

  const fields = readVehicleFields(formData);
  if ("error" in fields) return fields.error;

  const supabase = await createClient();
  const { error } = await supabase.from("supplier_vehicles").insert({
    supplier_id: supplierId,
    ...fields,
    is_active: true,
  });
  if (error) {
    return fail("Не удалось добавить транспорт.");
  }

  revalidateSupplierPaths(supplierId);
  return ok();
}

export async function updateSupplierVehicle(
  _prev: SupplierOrgActionState,
  formData: FormData,
): Promise<SupplierOrgActionState> {
  const denied = await denyNonOrgWriter();
  if (denied) return fail(denied);

  const id = String(formData.get("id") ?? "");
  const supplierId = String(formData.get("supplierId") ?? "");
  if (!id) return fail("Транспорт не найден.");

  const fields = readVehicleFields(formData);
  if ("error" in fields) return fields.error;

  const supabase = await createClient();
  const { error } = await supabase
    .from("supplier_vehicles")
    .update(fields)
    .eq("id", id);
  if (error) {
    return fail("Не удалось сохранить транспорт.");
  }

  revalidateSupplierPaths(supplierId);
  return ok();
}

export async function setSupplierVehicleActive(
  _prev: SupplierOrgActionState,
  formData: FormData,
): Promise<SupplierOrgActionState> {
  const denied = await denyNonOrgWriter();
  if (denied) return fail(denied);

  const id = String(formData.get("id") ?? "");
  const supplierId = String(formData.get("supplierId") ?? "");
  const isActive = String(formData.get("is_active") ?? "") === "true";
  if (!id) return fail("Транспорт не найден.");

  const supabase = await createClient();
  const { error } = await supabase
    .from("supplier_vehicles")
    .update({ is_active: isActive })
    .eq("id", id);
  if (error) {
    return fail("Не удалось изменить статус транспорта.");
  }

  revalidateSupplierPaths(supplierId);
  return ok();
}

export async function deleteSupplierVehicle(
  _prev: SupplierOrgActionState,
  formData: FormData,
): Promise<SupplierOrgActionState> {
  const denied = await denyNonOrgWriter();
  if (denied) return fail(denied);

  const id = String(formData.get("id") ?? "");
  const supplierId = String(formData.get("supplierId") ?? "");
  if (!id) return fail("Транспорт не найден.");

  const supabase = await createClient();
  const { error } = await supabase
    .from("supplier_vehicles")
    .delete()
    .eq("id", id);
  if (error) {
    return fail("Не удалось удалить транспорт.");
  }

  revalidateSupplierPaths(supplierId);
  return ok();
}

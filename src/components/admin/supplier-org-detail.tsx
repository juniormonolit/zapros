"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import type {
  ProductCatalogItem,
  SupplierOrgDetail,
  SupplierOrgPageData,
  SupplierUserOption,
} from "@/actions/supplier-org-types";
import { initialSupplierOrgState } from "@/actions/supplier-org-types";
import {
  createSupplierMember,
  createSupplierProduction,
  createSupplierVehicle,
  createSupplierWarehouse,
  deleteSupplierMember,
  deleteSupplierOrg,
  deleteSupplierProduction,
  deleteSupplierVehicle,
  deleteSupplierWarehouse,
  setSupplierMemberActive,
  setSupplierOrgActive,
  setSupplierProductionActive,
  setSupplierVehicleActive,
  setSupplierWarehouseActive,
  updateSupplierMember,
  updateSupplierOrg,
  updateSupplierProduction,
  updateSupplierVehicle,
  updateSupplierWarehouse,
} from "@/actions/supplier-org";
import { FormError } from "@/components/admin/form-error";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  AVAILABILITY_STATUSES,
  AVAILABILITY_STATUS_LABELS,
  NOTIFICATION_CHANNELS,
  NOTIFICATION_CHANNEL_LABELS,
  PRICE_MODELS,
  PRICE_MODEL_LABELS,
  SUPPLIER_KINDS,
  SUPPLIER_KIND_LABELS,
  SUPPLIER_MEMBER_ROLES,
  SUPPLIER_MEMBER_ROLE_LABELS,
  VEHICLE_TYPES,
  VEHICLE_TYPE_LABELS,
  WAVE_PRIORITIES,
  WAVE_PRIORITY_LABELS,
} from "@/lib/supplier-org-labels";
import {
  DEFAULT_SOURCING_STATUS,
  SOURCING_STATUS_LABELS,
  SOURCING_STATUSES,
  deriveWorksInZapros,
  type SourcingStatus,
} from "@/lib/sourcing";

const TABS = [
  { id: "general", label: "Основное" },
  { id: "members", label: "Контакты/аккаунты" },
  { id: "warehouses", label: "Склады" },
  { id: "productions", label: "Производства" },
  { id: "vehicles", label: "Автопарк" },
  { id: "terms", label: "Условия работы" },
  { id: "documents", label: "Документы" },
] as const;

type TabId = (typeof TABS)[number]["id"];

interface SupplierOrgDetailProps {
  data: SupplierOrgPageData;
  categories: ProductCatalogItem[];
  brands: ProductCatalogItem[];
  availableUsers: SupplierUserOption[];
  canWrite: boolean;
  canDelete: boolean;
}

export function SupplierOrgDetail({
  data,
  categories,
  brands,
  availableUsers,
  canWrite,
  canDelete,
}: SupplierOrgDetailProps) {
  const [tab, setTab] = useState<TabId>("general");
  const { supplier } = data;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/admin/suppliers"
          className="text-sm text-text-secondary hover:text-text-primary"
        >
          ← К списку
        </Link>
        <h1 className="text-xl font-semibold text-text-primary">
          {supplier.name}
        </h1>
        {supplier.is_active ? (
          <Badge variant="success">Активен</Badge>
        ) : (
          <Badge variant="muted">Неактивен</Badge>
        )}
      </div>

      <div className="flex flex-wrap gap-1 border-b border-border-primary pb-1">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={
              tab === item.id
                ? "rounded-t-lg border border-b-0 border-border-primary bg-bg-card px-3 py-2 text-sm font-medium text-text-primary"
                : "rounded-t-lg px-3 py-2 text-sm text-text-secondary hover:bg-bg-secondary/60 hover:text-text-primary"
            }
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === "general" ? (
        <GeneralTab
          supplier={supplier}
          categories={categories}
          brands={brands}
          canWrite={canWrite}
          canDelete={canDelete}
        />
      ) : null}
      {tab === "members" ? (
        <MembersTab
          data={data}
          availableUsers={availableUsers}
          canWrite={canWrite}
        />
      ) : null}
      {tab === "warehouses" ? (
        <WarehousesTab data={data} canWrite={canWrite} />
      ) : null}
      {tab === "productions" ? (
        <ProductionsTab data={data} canWrite={canWrite} />
      ) : null}
      {tab === "vehicles" ? (
        <VehiclesTab data={data} canWrite={canWrite} />
      ) : null}
      {tab === "terms" ? (
        <TermsTab supplier={supplier} canWrite={canWrite} />
      ) : null}
      {tab === "documents" ? (
        <DocumentsTab />
      ) : null}
    </div>
  );
}

function GeneralTab({
  supplier,
  categories,
  brands,
  canWrite,
  canDelete,
}: {
  supplier: SupplierOrgDetail;
  categories: ProductCatalogItem[];
  brands: ProductCatalogItem[];
  canWrite: boolean;
  canDelete: boolean;
}) {
  const [status, setStatus] = useState<SourcingStatus>(
    supplier.sourcing_status ?? DEFAULT_SOURCING_STATUS,
  );
  const [state, formAction, isPending] = useActionState(
    updateSupplierOrg,
    initialSupplierOrgState,
  );
  const [activeState, activeAction, isToggling] = useActionState(
    setSupplierOrgActive,
    initialSupplierOrgState,
  );
  const [deleteState, deleteAction, isDeleting] = useActionState(
    deleteSupplierOrg,
    initialSupplierOrgState,
  );

  if (!canWrite) {
    return (
      <ReadOnlyGeneral supplier={supplier} categories={categories} brands={brands} />
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Основное</CardTitle>
        <CardDescription>
          Тип, приоритет, категории, бренды, регионы и контакты организации.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <form action={formAction} className="flex flex-col gap-3">
          <input type="hidden" name="id" value={supplier.id} />
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-2 sm:col-span-2">
              <Label htmlFor="org-name">Название</Label>
              <Input id="org-name" name="name" defaultValue={supplier.name} required />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="org-kind">Тип</Label>
              <Select
                id="org-kind"
                name="supplier_kind"
                defaultValue={supplier.supplier_kind ?? ""}
              >
                <option value="">—</option>
                {SUPPLIER_KINDS.map((kind) => (
                  <option key={kind} value={kind}>
                    {SUPPLIER_KIND_LABELS[kind]}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="org-priority">Приоритет</Label>
              <Select
                id="org-priority"
                name="wave_priority"
                defaultValue={supplier.wave_priority}
              >
                {WAVE_PRIORITIES.map((priority) => (
                  <option key={priority} value={priority}>
                    {WAVE_PRIORITY_LABELS[priority]}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex flex-col gap-2 sm:col-span-2">
              <Label htmlFor="org-regions">Регионы (через запятую)</Label>
              <Input
                id="org-regions"
                name="regions"
                defaultValue={supplier.regions.join(", ")}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="org-contact">Контактное лицо</Label>
              <Input
                id="org-contact"
                name="contact_person"
                defaultValue={supplier.contact_person ?? ""}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="org-phone">Телефон</Label>
              <Input
                id="org-phone"
                name="phone"
                type="tel"
                defaultValue={supplier.phone ?? ""}
              />
            </div>
            <div className="flex flex-col gap-2 sm:col-span-2">
              <Label htmlFor="org-email">Email</Label>
              <Input
                id="org-email"
                name="email"
                type="email"
                defaultValue={supplier.email ?? ""}
              />
            </div>
            <div className="flex flex-col gap-2 sm:col-span-2">
              <Label htmlFor="org-status">Стадия проработки</Label>
              <Select
                id="org-status"
                name="sourcing_status"
                value={status}
                onChange={(event) =>
                  setStatus(event.target.value as SourcingStatus)
                }
              >
                {SOURCING_STATUSES.map((value) => (
                  <option key={value} value={value}>
                    {SOURCING_STATUS_LABELS[value]}
                  </option>
                ))}
              </Select>
              <p className="text-xs text-text-secondary">
                Работает в Zapros:{" "}
                <span
                  className={
                    deriveWorksInZapros(status)
                      ? "font-medium text-success"
                      : "text-text-muted"
                  }
                >
                  {deriveWorksInZapros(status) ? "да" : "нет"}
                </span>
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:col-span-2">
              <Label>Категории</Label>
              <div className="grid gap-2 sm:grid-cols-2">
                {categories.map((category) => (
                  <label
                    key={category.id}
                    className="flex items-center gap-2 text-sm text-text-secondary"
                  >
                    <input
                      type="checkbox"
                      name="categoryId"
                      value={category.id}
                      defaultChecked={supplier.category_ids.includes(category.id)}
                    />
                    {category.name}
                  </label>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-2 sm:col-span-2">
              <Label>Бренды</Label>
              <div className="grid gap-2 sm:grid-cols-2">
                {brands.map((brand) => (
                  <label
                    key={brand.id}
                    className="flex items-center gap-2 text-sm text-text-secondary"
                  >
                    <input
                      type="checkbox"
                      name="brandId"
                      value={brand.id}
                      defaultChecked={supplier.brand_ids.includes(brand.id)}
                    />
                    {brand.name}
                  </label>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-2 sm:col-span-2">
              <Label htmlFor="org-notes">Заметки</Label>
              <Textarea
                id="org-notes"
                name="notes"
                defaultValue={supplier.notes ?? ""}
              />
            </div>
          </div>
          <Button type="submit" disabled={isPending}>
            {isPending ? "Сохранение…" : "Сохранить"}
          </Button>
        </form>
        <FormError error={state.error} />

        <div className="flex flex-wrap gap-2 border-t border-border-primary pt-4">
          <form action={activeAction}>
            <input type="hidden" name="id" value={supplier.id} />
            <input
              type="hidden"
              name="is_active"
              value={(!supplier.is_active).toString()}
            />
            <Button type="submit" variant="secondary" disabled={isToggling}>
              {supplier.is_active ? "Деактивировать" : "Активировать"}
            </Button>
          </form>
          {canDelete ? (
            <form action={deleteAction}>
              <input type="hidden" name="id" value={supplier.id} />
              <Button type="submit" variant="destructive" disabled={isDeleting}>
                Удалить
              </Button>
            </form>
          ) : null}
        </div>
        <FormError
          error={activeState.error ?? deleteState.error}
        />
      </CardContent>
    </Card>
  );
}

function ReadOnlyGeneral({
  supplier,
  categories,
  brands,
}: {
  supplier: SupplierOrgDetail;
  categories: ProductCatalogItem[];
  brands: ProductCatalogItem[];
}) {
  const categoryNames = categories
    .filter((c) => supplier.category_ids.includes(c.id))
    .map((c) => c.name)
    .join(", ");
  const brandNames = brands
    .filter((b) => supplier.brand_ids.includes(b.id))
    .map((b) => b.name)
    .join(", ");

  return (
    <Card>
      <CardHeader>
        <CardTitle>Основное</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-2 text-sm sm:grid-cols-2">
        <Field label="Тип" value={supplier.supplier_kind ? SUPPLIER_KIND_LABELS[supplier.supplier_kind] : "—"} />
        <Field label="Приоритет" value={WAVE_PRIORITY_LABELS[supplier.wave_priority]} />
        <Field label="Регионы" value={supplier.regions.join(", ") || "—"} />
        <Field label="Контакт" value={supplier.contact_person ?? "—"} />
        <Field label="Телефон" value={supplier.phone ?? "—"} />
        <Field label="Email" value={supplier.email ?? "—"} />
        <Field label="Категории" value={categoryNames || "—"} />
        <Field label="Бренды" value={brandNames || "—"} />
      </CardContent>
    </Card>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-text-muted">{label}</p>
      <p className="text-text-primary">{value}</p>
    </div>
  );
}

function MembersTab({
  data,
  availableUsers,
  canWrite,
}: {
  data: SupplierOrgPageData;
  availableUsers: SupplierUserOption[];
  canWrite: boolean;
}) {
  const { supplier, members } = data;
  const [createState, createAction, isCreating] = useActionState(
    createSupplierMember,
    initialSupplierOrgState,
  );

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Основной контакт</CardTitle>
          <CardDescription>
            Поля на вкладке «Основное» — не привязаны к учётной записи.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-text-secondary">
          {[supplier.contact_person, supplier.phone, supplier.email]
            .filter(Boolean)
            .join(" · ") || "Не указан"}
        </CardContent>
      </Card>

      {canWrite ? (
        <Card>
          <CardHeader>
            <CardTitle>Добавить участника</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={createAction} className="flex flex-col gap-3">
              <input type="hidden" name="supplierId" value={supplier.id} />
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="member-user">Пользователь</Label>
                  <Select id="member-user" name="userId" required defaultValue="">
                    <option value="" disabled>
                      Выберите…
                    </option>
                    {availableUsers.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.email ?? user.full_name ?? user.id}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="member-role">Роль</Label>
                  <Select
                    id="member-role"
                    name="member_role"
                    defaultValue="supplier_user"
                  >
                    {SUPPLIER_MEMBER_ROLES.map((role) => (
                      <option key={role} value={role}>
                        {SUPPLIER_MEMBER_ROLE_LABELS[role]}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>
              <Button type="submit" disabled={isCreating || availableUsers.length === 0}>
                {isCreating ? "Добавление…" : "Добавить"}
              </Button>
            </form>
            <FormError error={createState.error} />
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Участники ({members.length})</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {members.length === 0 ? (
            <p className="text-sm text-text-secondary">Участников пока нет.</p>
          ) : (
            members.map((member) => (
              <MemberRow
                key={member.id}
                member={member}
                supplierId={supplier.id}
                canWrite={canWrite}
              />
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function MemberRow({
  member,
  supplierId,
  canWrite,
}: {
  member: SupplierOrgPageData["members"][number];
  supplierId: string;
  canWrite: boolean;
}) {
  const [editState, editAction, isSaving] = useActionState(
    updateSupplierMember,
    initialSupplierOrgState,
  );
  const [activeState, activeAction, isToggling] = useActionState(
    setSupplierMemberActive,
    initialSupplierOrgState,
  );
  const [deleteState, deleteAction, isDeleting] = useActionState(
    deleteSupplierMember,
    initialSupplierOrgState,
  );

  return (
    <div className="rounded-lg border border-border-primary bg-bg-secondary/30 p-3">
      <div className="mb-2 text-sm font-medium text-text-primary">
        {member.full_name ?? member.email ?? member.user_id}
      </div>
      {canWrite ? (
        <form action={editAction} className="flex flex-col gap-2">
          <input type="hidden" name="id" value={member.id} />
          <input type="hidden" name="supplierId" value={supplierId} />
          <Select name="member_role" defaultValue={member.member_role}>
            {SUPPLIER_MEMBER_ROLES.map((role) => (
              <option key={role} value={role}>
                {SUPPLIER_MEMBER_ROLE_LABELS[role]}
              </option>
            ))}
          </Select>
          <Button type="submit" size="sm" disabled={isSaving}>
            Сохранить роль
          </Button>
        </form>
      ) : (
        <p className="text-sm text-text-secondary">
          {SUPPLIER_MEMBER_ROLE_LABELS[member.member_role]}
        </p>
      )}
      {canWrite ? (
        <div className="mt-2 flex gap-2">
          <form action={activeAction}>
            <input type="hidden" name="id" value={member.id} />
            <input type="hidden" name="supplierId" value={supplierId} />
            <input
              type="hidden"
              name="is_active"
              value={(!member.is_active).toString()}
            />
            <Button type="submit" size="sm" variant="secondary" disabled={isToggling}>
              {member.is_active ? "Деактивировать" : "Активировать"}
            </Button>
          </form>
          <form action={deleteAction}>
            <input type="hidden" name="id" value={member.id} />
            <input type="hidden" name="supplierId" value={supplierId} />
            <Button type="submit" size="sm" variant="destructive" disabled={isDeleting}>
              Удалить
            </Button>
          </form>
        </div>
      ) : null}
      <FormError
        error={editState.error ?? activeState.error ?? deleteState.error}
      />
    </div>
  );
}

function SiteFields({ idPrefix }: { idPrefix: string }) {
  return (
    <>
      <div className="flex flex-col gap-2 sm:col-span-2">
        <Label htmlFor={`${idPrefix}-name`}>Название</Label>
        <Input id={`${idPrefix}-name`} name="name" required />
      </div>
      <div className="flex flex-col gap-2 sm:col-span-2">
        <Label htmlFor={`${idPrefix}-address`}>Адрес</Label>
        <Input id={`${idPrefix}-address`} name="address" />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${idPrefix}-region`}>Регион</Label>
        <Input id={`${idPrefix}-region`} name="region" />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${idPrefix}-phone`}>Телефон</Label>
        <Input id={`${idPrefix}-phone`} name="phone" type="tel" />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${idPrefix}-contact`}>Контакт</Label>
        <Input id={`${idPrefix}-contact`} name="contact_name" />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${idPrefix}-hours`}>Часы работы</Label>
        <Input id={`${idPrefix}-hours`} name="working_hours" />
      </div>
      <div className="flex flex-col gap-2 sm:col-span-2">
        <Label htmlFor={`${idPrefix}-loading`}>Условия погрузки</Label>
        <Input id={`${idPrefix}-loading`} name="loading_conditions" />
      </div>
      <div className="flex flex-col gap-2 sm:col-span-2">
        <Label htmlFor={`${idPrefix}-comment`}>Комментарий</Label>
        <Textarea id={`${idPrefix}-comment`} name="comment" />
      </div>
    </>
  );
}

function WarehousesTab({
  data,
  canWrite,
}: {
  data: SupplierOrgPageData;
  canWrite: boolean;
}) {
  const { supplier, warehouses } = data;
  const [state, formAction, isPending] = useActionState(
    createSupplierWarehouse,
    initialSupplierOrgState,
  );

  return (
    <div className="flex flex-col gap-4">
      {canWrite ? (
        <Card>
          <CardHeader>
            <CardTitle>Новый склад</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={formAction} className="grid gap-3 sm:grid-cols-2">
              <input type="hidden" name="supplierId" value={supplier.id} />
              <SiteFields idPrefix="wh-new" />
              <label className="flex items-center gap-2 text-sm sm:col-span-2">
                <input type="checkbox" name="pickup_available" />
                Самовывоз
              </label>
              <label className="flex items-center gap-2 text-sm sm:col-span-2">
                <input type="checkbox" name="delivery_available" />
                Доставка
              </label>
              <div className="sm:col-span-2">
                <Button type="submit" disabled={isPending}>
                  {isPending ? "Создание…" : "Добавить склад"}
                </Button>
              </div>
            </form>
            <FormError error={state.error} />
          </CardContent>
        </Card>
      ) : null}

      {warehouses.length === 0 ? (
        <p className="text-sm text-text-secondary">Складов пока нет.</p>
      ) : (
        warehouses.map((warehouse) => (
          <SiteCard
            key={warehouse.id}
            title={warehouse.name}
            subtitle={[warehouse.region, warehouse.address].filter(Boolean).join(" · ")}
            isActive={warehouse.is_active}
            canWrite={canWrite}
            updateAction={updateSupplierWarehouse}
            activeAction={setSupplierWarehouseActive}
            deleteAction={deleteSupplierWarehouse}
            entityId={warehouse.id}
            supplierId={supplier.id}
            extra={
              <>
                <label className="flex items-center gap-2 text-sm sm:col-span-2">
                  <input
                    type="checkbox"
                    name="pickup_available"
                    defaultChecked={warehouse.pickup_available}
                  />
                  Самовывоз
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="delivery_available"
                    defaultChecked={warehouse.delivery_available}
                  />
                  Доставка
                </label>
              </>
            }
            defaults={{
              name: warehouse.name,
              address: warehouse.address ?? "",
              region: warehouse.region ?? "",
              phone: warehouse.phone ?? "",
              contact_name: warehouse.contact_name ?? "",
              working_hours: warehouse.working_hours ?? "",
              loading_conditions: warehouse.loading_conditions ?? "",
              comment: warehouse.comment ?? "",
            }}
          />
        ))
      )}
    </div>
  );
}

function ProductionsTab({
  data,
  canWrite,
}: {
  data: SupplierOrgPageData;
  canWrite: boolean;
}) {
  const { supplier, productions } = data;
  const [state, formAction, isPending] = useActionState(
    createSupplierProduction,
    initialSupplierOrgState,
  );

  return (
    <div className="flex flex-col gap-4">
      {canWrite ? (
        <Card>
          <CardHeader>
            <CardTitle>Новое производство</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={formAction} className="grid gap-3 sm:grid-cols-2">
              <input type="hidden" name="supplierId" value={supplier.id} />
              <SiteFields idPrefix="prod-new" />
              <div className="sm:col-span-2">
                <Button type="submit" disabled={isPending}>
                  {isPending ? "Создание…" : "Добавить производство"}
                </Button>
              </div>
            </form>
            <FormError error={state.error} />
          </CardContent>
        </Card>
      ) : null}

      {productions.length === 0 ? (
        <p className="text-sm text-text-secondary">Производств пока нет.</p>
      ) : (
        productions.map((production) => (
          <SiteCard
            key={production.id}
            title={production.name}
            subtitle={[production.region, production.address].filter(Boolean).join(" · ")}
            isActive={production.is_active}
            canWrite={canWrite}
            updateAction={updateSupplierProduction}
            activeAction={setSupplierProductionActive}
            deleteAction={deleteSupplierProduction}
            entityId={production.id}
            supplierId={supplier.id}
            defaults={{
              name: production.name,
              address: production.address ?? "",
              region: production.region ?? "",
              phone: production.phone ?? "",
              contact_name: production.contact_name ?? "",
              working_hours: production.working_hours ?? "",
              loading_conditions: production.loading_conditions ?? "",
              comment: production.comment ?? "",
            }}
          />
        ))
      )}
    </div>
  );
}

function SiteCard({
  title,
  subtitle,
  isActive,
  canWrite,
  updateAction,
  activeAction,
  deleteAction,
  entityId,
  supplierId,
  defaults,
  extra,
}: {
  title: string;
  subtitle: string;
  isActive: boolean;
  canWrite: boolean;
  updateAction: typeof updateSupplierWarehouse;
  activeAction: typeof setSupplierWarehouseActive;
  deleteAction: typeof deleteSupplierWarehouse;
  entityId: string;
  supplierId: string;
  defaults: Record<string, string>;
  extra?: React.ReactNode;
}) {
  const [editState, editFormAction, isSaving] = useActionState(
    updateAction,
    initialSupplierOrgState,
  );
  const [activeState, toggleAction, isToggling] = useActionState(
    activeAction,
    initialSupplierOrgState,
  );
  const [deleteState, removeAction, isDeleting] = useActionState(
    deleteAction,
    initialSupplierOrgState,
  );

  if (!canWrite) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{subtitle || "—"}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {title}
          {isActive ? (
            <Badge variant="success">Активен</Badge>
          ) : (
            <Badge variant="muted">Неактивен</Badge>
          )}
        </CardTitle>
        <CardDescription>{subtitle || "—"}</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={editFormAction} className="grid gap-3 sm:grid-cols-2">
          <input type="hidden" name="id" value={entityId} />
          <input type="hidden" name="supplierId" value={supplierId} />
          <div className="flex flex-col gap-2 sm:col-span-2">
            <Label>Название</Label>
            <Input name="name" defaultValue={defaults.name} required />
          </div>
          <div className="flex flex-col gap-2 sm:col-span-2">
            <Label>Адрес</Label>
            <Input name="address" defaultValue={defaults.address} />
          </div>
          <div className="flex flex-col gap-2">
            <Label>Регион</Label>
            <Input name="region" defaultValue={defaults.region} />
          </div>
          <div className="flex flex-col gap-2">
            <Label>Телефон</Label>
            <Input name="phone" type="tel" defaultValue={defaults.phone} />
          </div>
          <div className="flex flex-col gap-2">
            <Label>Контакт</Label>
            <Input name="contact_name" defaultValue={defaults.contact_name} />
          </div>
          <div className="flex flex-col gap-2">
            <Label>Часы работы</Label>
            <Input name="working_hours" defaultValue={defaults.working_hours} />
          </div>
          <div className="flex flex-col gap-2 sm:col-span-2">
            <Label>Условия погрузки</Label>
            <Input
              name="loading_conditions"
              defaultValue={defaults.loading_conditions}
            />
          </div>
          <div className="flex flex-col gap-2 sm:col-span-2">
            <Label>Комментарий</Label>
            <Textarea name="comment" defaultValue={defaults.comment} />
          </div>
          {extra}
          <div className="flex flex-wrap gap-2 sm:col-span-2">
            <Button type="submit" size="sm" disabled={isSaving}>
              Сохранить
            </Button>
          </div>
        </form>
        <div className="mt-2 flex gap-2">
          <form action={toggleAction}>
            <input type="hidden" name="id" value={entityId} />
            <input type="hidden" name="supplierId" value={supplierId} />
            <input
              type="hidden"
              name="is_active"
              value={(!isActive).toString()}
            />
            <Button type="submit" size="sm" variant="secondary" disabled={isToggling}>
              {isActive ? "Деактивировать" : "Активировать"}
            </Button>
          </form>
          <form action={removeAction}>
            <input type="hidden" name="id" value={entityId} />
            <input type="hidden" name="supplierId" value={supplierId} />
            <Button type="submit" size="sm" variant="destructive" disabled={isDeleting}>
              Удалить
            </Button>
          </form>
        </div>
        <FormError
          error={editState.error ?? activeState.error ?? deleteState.error}
        />
      </CardContent>
    </Card>
  );
}

function VehiclesTab({
  data,
  canWrite,
}: {
  data: SupplierOrgPageData;
  canWrite: boolean;
}) {
  const { supplier, vehicles } = data;
  const [state, formAction, isPending] = useActionState(
    createSupplierVehicle,
    initialSupplierOrgState,
  );

  return (
    <div className="flex flex-col gap-4">
      {canWrite ? (
        <Card>
          <CardHeader>
            <CardTitle>Новый транспорт</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={formAction} className="grid gap-3 sm:grid-cols-2">
              <input type="hidden" name="supplierId" value={supplier.id} />
              <div className="flex flex-col gap-2 sm:col-span-2">
                <Label htmlFor="veh-title">Название</Label>
                <Input id="veh-title" name="title" required />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="veh-type">Тип</Label>
                <Select id="veh-type" name="vehicle_type" defaultValue="truck">
                  {VEHICLE_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {VEHICLE_TYPE_LABELS[type]}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="veh-region">Регион</Label>
                <Input id="veh-region" name="region" />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="veh-payload">Грузоподъёмность, т</Label>
                <Input id="veh-payload" name="payload_tons" type="number" step="0.1" min="0" />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="veh-volume">Объём, м³</Label>
                <Input id="veh-volume" name="volume_m3" type="number" step="0.1" min="0" />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="veh-price-model">Модель цены</Label>
                <Select id="veh-price-model" name="price_model" defaultValue="">
                  <option value="">—</option>
                  {PRICE_MODELS.map((model) => (
                    <option key={model} value={model}>
                      {PRICE_MODEL_LABELS[model]}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="veh-status">Доступность</Label>
                <Select
                  id="veh-status"
                  name="availability_status"
                  defaultValue="unknown"
                >
                  {AVAILABILITY_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {AVAILABILITY_STATUS_LABELS[status]}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="sm:col-span-2">
                <Button type="submit" disabled={isPending}>
                  {isPending ? "Добавление…" : "Добавить транспорт"}
                </Button>
              </div>
            </form>
            <FormError error={state.error} />
          </CardContent>
        </Card>
      ) : null}

      {vehicles.length === 0 ? (
        <p className="text-sm text-text-secondary">Транспорта пока нет.</p>
      ) : (
        vehicles.map((vehicle) => (
          <VehicleRow
            key={vehicle.id}
            vehicle={vehicle}
            supplierId={supplier.id}
            canWrite={canWrite}
          />
        ))
      )}
    </div>
  );
}

function VehicleRow({
  vehicle,
  supplierId,
  canWrite,
}: {
  vehicle: SupplierOrgPageData["vehicles"][number];
  supplierId: string;
  canWrite: boolean;
}) {
  const [editState, editAction, isSaving] = useActionState(
    updateSupplierVehicle,
    initialSupplierOrgState,
  );
  const [activeState, activeAction, isToggling] = useActionState(
    setSupplierVehicleActive,
    initialSupplierOrgState,
  );
  const [deleteState, deleteAction, isDeleting] = useActionState(
    deleteSupplierVehicle,
    initialSupplierOrgState,
  );

  if (!canWrite) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{vehicle.title}</CardTitle>
          <CardDescription>
            {VEHICLE_TYPE_LABELS[vehicle.vehicle_type]}
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{vehicle.title}</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={editAction} className="grid gap-3 sm:grid-cols-2">
          <input type="hidden" name="id" value={vehicle.id} />
          <input type="hidden" name="supplierId" value={supplierId} />
          <div className="flex flex-col gap-2 sm:col-span-2">
            <Label>Название</Label>
            <Input name="title" defaultValue={vehicle.title} required />
          </div>
          <div className="flex flex-col gap-2">
            <Label>Тип</Label>
            <Select name="vehicle_type" defaultValue={vehicle.vehicle_type}>
              {VEHICLE_TYPES.map((type) => (
                <option key={type} value={type}>
                  {VEHICLE_TYPE_LABELS[type]}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label>Регион</Label>
            <Input name="region" defaultValue={vehicle.region ?? ""} />
          </div>
          <div className="flex flex-col gap-2">
            <Label>Грузоподъёмность, т</Label>
            <Input
              name="payload_tons"
              type="number"
              step="0.1"
              min="0"
              defaultValue={vehicle.payload_tons ?? ""}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label>Объём, м³</Label>
            <Input
              name="volume_m3"
              type="number"
              step="0.1"
              min="0"
              defaultValue={vehicle.volume_m3 ?? ""}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label>Модель цены</Label>
            <Select name="price_model" defaultValue={vehicle.price_model ?? ""}>
              <option value="">—</option>
              {PRICE_MODELS.map((model) => (
                <option key={model} value={model}>
                  {PRICE_MODEL_LABELS[model]}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label>Доступность</Label>
            <Select
              name="availability_status"
              defaultValue={vehicle.availability_status}
            >
              {AVAILABILITY_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {AVAILABILITY_STATUS_LABELS[status]}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex flex-wrap gap-2 sm:col-span-2">
            <Button type="submit" size="sm" disabled={isSaving}>
              Сохранить
            </Button>
          </div>
        </form>
        <div className="mt-2 flex gap-2">
          <form action={activeAction}>
            <input type="hidden" name="id" value={vehicle.id} />
            <input type="hidden" name="supplierId" value={supplierId} />
            <input
              type="hidden"
              name="is_active"
              value={(!vehicle.is_active).toString()}
            />
            <Button type="submit" size="sm" variant="secondary" disabled={isToggling}>
              {vehicle.is_active ? "Деактивировать" : "Активировать"}
            </Button>
          </form>
          <form action={deleteAction}>
            <input type="hidden" name="id" value={vehicle.id} />
            <input type="hidden" name="supplierId" value={supplierId} />
            <Button type="submit" size="sm" variant="destructive" disabled={isDeleting}>
              Удалить
            </Button>
          </form>
        </div>
        <FormError
          error={editState.error ?? activeState.error ?? deleteState.error}
        />
      </CardContent>
    </Card>
  );
}

function TermsTab({
  supplier,
  canWrite,
}: {
  supplier: SupplierOrgDetail;
  canWrite: boolean;
}) {
  const [state, formAction, isPending] = useActionState(
    updateSupplierOrg,
    initialSupplierOrgState,
  );

  if (!canWrite) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Условия работы</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm sm:grid-cols-2">
          <Field
            label="Работа с НДС"
            value={
              supplier.works_with_vat === null
                ? "—"
                : supplier.works_with_vat
                  ? "Да"
                  : "Нет"
            }
          />
          <Field
            label="Отсрочка, дней"
            value={
              supplier.payment_deferral_days?.toString() ?? "—"
            }
          />
          <Field
            label="Мин. сумма заказа"
            value={supplier.min_order_amount?.toString() ?? "—"}
          />
          <Field
            label="Доставка"
            value={
              supplier.delivery_available === null
                ? "—"
                : supplier.delivery_available
                  ? "Да"
                  : "Нет"
            }
          />
          <Field
            label="Самовывоз"
            value={
              supplier.pickup_available === null
                ? "—"
                : supplier.pickup_available
                  ? "Да"
                  : "Нет"
            }
          />
          <Field label="Комментарий" value={supplier.terms_comment ?? "—"} />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Условия работы</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="grid gap-3 sm:grid-cols-2">
          <input type="hidden" name="id" value={supplier.id} />
          <input type="hidden" name="name" value={supplier.name} />
          <input
            type="hidden"
            name="wave_priority"
            value={supplier.wave_priority}
          />
          <input
            type="hidden"
            name="sourcing_status"
            value={supplier.sourcing_status}
          />
          <input type="hidden" name="regions" value={supplier.regions.join(", ")} />
          <input type="hidden" name="contact_person" value={supplier.contact_person ?? ""} />
          <input type="hidden" name="phone" value={supplier.phone ?? ""} />
          <input type="hidden" name="email" value={supplier.email ?? ""} />
          <input type="hidden" name="notes" value={supplier.notes ?? ""} />
          {supplier.supplier_kind ? (
            <input type="hidden" name="supplier_kind" value={supplier.supplier_kind} />
          ) : null}
          {supplier.category_ids.map((id) => (
            <input key={id} type="hidden" name="categoryId" value={id} />
          ))}
          {supplier.brand_ids.map((id) => (
            <input key={id} type="hidden" name="brandId" value={id} />
          ))}
          <div className="flex flex-col gap-2">
            <Label htmlFor="terms-vat">Работа с НДС</Label>
            <Select
              id="terms-vat"
              name="works_with_vat"
              defaultValue={
                supplier.works_with_vat === null
                  ? ""
                  : supplier.works_with_vat
                    ? "true"
                    : "false"
              }
            >
              <option value="">—</option>
              <option value="true">Да</option>
              <option value="false">Нет</option>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="terms-deferral">Отсрочка, дней</Label>
            <Input
              id="terms-deferral"
              name="payment_deferral_days"
              type="number"
              min="0"
              step="1"
              defaultValue={supplier.payment_deferral_days ?? ""}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="terms-min">Мин. сумма заказа</Label>
            <Input
              id="terms-min"
              name="min_order_amount"
              type="number"
              min="0"
              step="0.01"
              defaultValue={supplier.min_order_amount ?? ""}
            />
          </div>
          <div className="flex flex-col gap-2 sm:col-span-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="delivery_available"
                defaultChecked={supplier.delivery_available === true}
              />
              Доставка доступна
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="pickup_available"
                defaultChecked={supplier.pickup_available === true}
              />
              Самовывоз доступен
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="share_team_responses"
                defaultChecked={supplier.share_team_responses}
              />
              Пользователи видят ответы коллег
            </label>
          </div>
          <div className="flex flex-col gap-2 sm:col-span-2">
            <Label>Каналы уведомлений</Label>
            <div className="flex flex-wrap gap-3">
              {NOTIFICATION_CHANNELS.map((channel) => (
                <label key={channel} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="notification_channel"
                    value={channel}
                    defaultChecked={supplier.notification_channels.includes(channel)}
                  />
                  {NOTIFICATION_CHANNEL_LABELS[channel]}
                </label>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:col-span-2">
            <Label htmlFor="terms-comment">Комментарий</Label>
            <Textarea
              id="terms-comment"
              name="terms_comment"
              defaultValue={supplier.terms_comment ?? ""}
            />
          </div>
          <div className="sm:col-span-2">
            <Button type="submit" disabled={isPending}>
              {isPending ? "Сохранение…" : "Сохранить условия"}
            </Button>
          </div>
        </form>
        <FormError error={state.error} />
      </CardContent>
    </Card>
  );
}

function DocumentsTab() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Документы</CardTitle>
        <CardDescription>
          Прайс-листы, договоры и сертификаты — в разработке.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-text-secondary">Скоро</p>
      </CardContent>
    </Card>
  );
}

import Link from "next/link";

import type {
  ProductCatalogItem,
  SupplierKind,
  SupplierOrgListItem,
  WavePriority,
} from "@/actions/supplier-org-types";
import {
  SUPPLIER_KINDS,
  WAVE_PRIORITIES,
} from "@/actions/supplier-org-types";
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
import {
  SUPPLIER_KIND_LABELS,
  WAVE_PRIORITY_LABELS,
} from "@/lib/supplier-org-labels";

export interface SupplierListFilterValues {
  kind: string;
  priority: string;
  category: string;
  brand: string;
  region: string;
  active: string;
  q: string;
}

interface SupplierOrgListProps {
  suppliers: SupplierOrgListItem[];
  categories: ProductCatalogItem[];
  brands: ProductCatalogItem[];
  regions: string[];
  filters: SupplierListFilterValues;
  error?: string | null;
}

function catalogNames(
  ids: string[],
  catalog: ProductCatalogItem[],
): string {
  if (ids.length === 0) return "—";
  const byId = new Map(catalog.map((item) => [item.id, item.name]));
  return ids
    .map((id) => byId.get(id))
    .filter(Boolean)
    .join(", ") || "—";
}

function regionsLabel(regions: string[]): string {
  return regions.length > 0 ? regions.join(", ") : "—";
}

function ActiveBadge({ isActive }: { isActive: boolean }) {
  return (
    <span
      className={
        isActive
          ? "rounded-md border border-success-border bg-success-bg px-2 py-0.5 text-xs font-medium text-success"
          : "rounded-md border border-border-primary bg-bg-secondary px-2 py-0.5 text-xs font-medium text-text-muted"
      }
    >
      {isActive ? "Да" : "Нет"}
    </span>
  );
}

export function SupplierOrgList({
  suppliers,
  categories,
  brands,
  regions,
  filters,
  error,
}: SupplierOrgListProps) {
  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Фильтры</CardTitle>
          <CardDescription>
            Тип, приоритет, категория, бренд, регион, активность и поиск по
            названию, контакту, телефону или бренду.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            method="get"
            action="/admin/suppliers"
            className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
          >
            <div className="flex flex-col gap-2 sm:col-span-2 lg:col-span-4">
              <Label htmlFor="filter-q">Поиск</Label>
              <Input
                id="filter-q"
                name="q"
                defaultValue={filters.q}
                placeholder="Название, контакт, телефон, бренд…"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="filter-kind">Тип</Label>
              <Select id="filter-kind" name="kind" defaultValue={filters.kind}>
                <option value="">Все</option>
                {SUPPLIER_KINDS.map((kind) => (
                  <option key={kind} value={kind}>
                    {SUPPLIER_KIND_LABELS[kind as SupplierKind]}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="filter-priority">Приоритет</Label>
              <Select
                id="filter-priority"
                name="priority"
                defaultValue={filters.priority}
              >
                <option value="">Все</option>
                {WAVE_PRIORITIES.map((priority) => (
                  <option key={priority} value={priority}>
                    {WAVE_PRIORITY_LABELS[priority as WavePriority]}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="filter-category">Категория</Label>
              <Select
                id="filter-category"
                name="category"
                defaultValue={filters.category}
              >
                <option value="">Все</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="filter-brand">Бренд</Label>
              <Select
                id="filter-brand"
                name="brand"
                defaultValue={filters.brand}
              >
                <option value="">Все</option>
                {brands.map((brand) => (
                  <option key={brand.id} value={brand.id}>
                    {brand.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="filter-region">Регион</Label>
              <Select
                id="filter-region"
                name="region"
                defaultValue={filters.region}
              >
                <option value="">Все</option>
                {regions.map((region) => (
                  <option key={region} value={region}>
                    {region}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="filter-active">Активен</Label>
              <Select
                id="filter-active"
                name="active"
                defaultValue={filters.active}
              >
                <option value="">Все</option>
                <option value="true">Да</option>
                <option value="false">Нет</option>
              </Select>
            </div>
            <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-4">
              <Button type="submit">Применить</Button>
              <Link
                href="/admin/suppliers"
                className="inline-flex h-8 items-center justify-center rounded-lg border border-border bg-background px-2.5 text-sm font-medium hover:bg-muted"
              >
                Сбросить
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Поставщики</CardTitle>
          <CardDescription>
            {error
              ? error
              : suppliers.length > 0
                ? `Найдено: ${suppliers.length}`
                : "Поставщики не найдены."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {suppliers.length === 0 ? (
            <p className="text-sm text-text-secondary">
              Измените фильтры или создайте нового поставщика.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-max border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border-primary text-left text-text-secondary">
                    <th className="px-3 py-2 font-medium">Название</th>
                    <th className="px-3 py-2 font-medium">Тип</th>
                    <th className="px-3 py-2 font-medium">Приоритет</th>
                    <th className="px-3 py-2 font-medium">Категории</th>
                    <th className="px-3 py-2 font-medium">Бренды</th>
                    <th className="px-3 py-2 font-medium">Регион</th>
                    <th className="px-3 py-2 font-medium">Контакт</th>
                    <th className="px-3 py-2 font-medium">Телефон</th>
                    <th className="px-3 py-2 font-medium">Активен</th>
                  </tr>
                </thead>
                <tbody>
                  {suppliers.map((supplier) => (
                    <tr
                      key={supplier.id}
                      className="border-b border-border-primary/60 hover:bg-bg-secondary/40"
                    >
                      <td className="px-3 py-2">
                        <Link
                          href={`/admin/suppliers/${supplier.id}`}
                          className="font-medium text-accent hover:underline"
                        >
                          {supplier.name}
                        </Link>
                      </td>
                      <td className="px-3 py-2 text-text-secondary">
                        {supplier.supplier_kind
                          ? SUPPLIER_KIND_LABELS[supplier.supplier_kind]
                          : "—"}
                      </td>
                      <td className="px-3 py-2">
                        <Badge variant="accent">
                          {WAVE_PRIORITY_LABELS[supplier.wave_priority]}
                        </Badge>
                      </td>
                      <td className="max-w-[12rem] truncate px-3 py-2 text-text-secondary">
                        {catalogNames(supplier.category_ids, categories)}
                      </td>
                      <td className="max-w-[12rem] truncate px-3 py-2 text-text-secondary">
                        {catalogNames(supplier.brand_ids, brands)}
                      </td>
                      <td className="max-w-[10rem] truncate px-3 py-2 text-text-secondary">
                        {regionsLabel(supplier.regions)}
                      </td>
                      <td className="px-3 py-2 text-text-secondary">
                        {supplier.contact_person ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-text-secondary">
                        {supplier.phone ?? "—"}
                      </td>
                      <td className="px-3 py-2">
                        <ActiveBadge isActive={supplier.is_active} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

"use client";

import { useActionState, useState } from "react";

import {
  initialCatalogState,
  type Supplier,
} from "@/actions/admin-catalog-types";
import {
  createSupplier,
  deleteSupplier,
  setSupplierActive,
  updateSupplier,
} from "@/actions/admin-catalog";
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
  DEFAULT_SOURCING_STATUS,
  deriveWorksInZapros,
  SOURCING_STATUS_LABELS,
  SOURCING_STATUSES,
  type SourcingStatus,
} from "@/lib/sourcing";

import { FormError } from "./form-error";

interface SupplierManagerProps {
  suppliers: Supplier[];
}

/**
 * Admin UI for the suppliers reference table: a creation form plus an editable
 * row per supplier (contact fields, sourcing stage, activate/deactivate,
 * delete). Each form is wired to its own server action via `useActionState`,
 * mirroring the login form pattern.
 */
export function SupplierManager({ suppliers }: SupplierManagerProps) {
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <CreateSupplierForm />

      <Card>
        <CardHeader>
          <CardTitle>Поставщики</CardTitle>
          <CardDescription>
            {suppliers.length > 0
              ? `Всего: ${suppliers.length}`
              : "Список пуст — добавьте первого поставщика."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {suppliers.map((supplier) => (
            <SupplierRow key={supplier.id} supplier={supplier} />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Shared contact + sourcing inputs reused by the create and edit forms. The
 * stage `<select>` is controlled so the derived "Работает в Zapros" hint stays
 * in sync with the chosen stage in real time — the flag is never an
 * independent control.
 */
function SupplierFields({
  idPrefix,
  supplier,
}: {
  idPrefix: string;
  supplier?: Supplier;
}) {
  const [status, setStatus] = useState<SourcingStatus>(
    supplier?.sourcing_status ?? DEFAULT_SOURCING_STATUS,
  );

  return (
    <>
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${idPrefix}-contact`}>Контактное лицо</Label>
        <Input
          id={`${idPrefix}-contact`}
          name="contact_person"
          defaultValue={supplier?.contact_person ?? ""}
          placeholder="Например, Иван Петров"
        />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="flex flex-1 flex-col gap-2">
          <Label htmlFor={`${idPrefix}-phone`}>Телефон</Label>
          <Input
            id={`${idPrefix}-phone`}
            name="phone"
            type="tel"
            defaultValue={supplier?.phone ?? ""}
            placeholder="+7 900 000-00-00"
          />
        </div>
        <div className="flex flex-1 flex-col gap-2">
          <Label htmlFor={`${idPrefix}-email`}>Email</Label>
          <Input
            id={`${idPrefix}-email`}
            name="email"
            type="email"
            defaultValue={supplier?.email ?? ""}
            placeholder="sales@example.com"
          />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor={`${idPrefix}-status`}>Стадия</Label>
        <Select
          id={`${idPrefix}-status`}
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
        <WorksInZaprosHint status={status} />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor={`${idPrefix}-notes`}>Заметки</Label>
        <Textarea
          id={`${idPrefix}-notes`}
          name="notes"
          defaultValue={supplier?.notes ?? ""}
          placeholder="Условия, договорённости, комментарии"
        />
      </div>
    </>
  );
}

/**
 * Read-only indicator derived from the selected stage. Makes the "single source
 * of truth" rule visible to the admin without exposing an independent toggle.
 */
function WorksInZaprosHint({ status }: { status: SourcingStatus }) {
  const works = deriveWorksInZapros(status);
  return (
    <p className="text-xs text-text-secondary">
      Работает в Zapros:{" "}
      <span className={works ? "font-medium text-success" : "text-text-muted"}>
        {works ? "да" : "нет"}
      </span>{" "}
      — определяется стадией автоматически.
    </p>
  );
}

function CreateSupplierForm() {
  const [state, formAction, isPending] = useActionState(
    createSupplier,
    initialCatalogState,
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Новый поставщик</CardTitle>
        <CardDescription>Создайте запись в справочнике.</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="flex flex-col gap-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor="new-supplier-name">Название</Label>
            <Input
              id="new-supplier-name"
              name="name"
              placeholder="Например, СтройТепло"
              required
              aria-invalid={state.error ? true : undefined}
            />
          </div>
          <SupplierFields idPrefix="new-supplier" />
          <div>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Добавление…" : "Добавить"}
            </Button>
          </div>
        </form>
        <FormError error={state.error} />
      </CardContent>
    </Card>
  );
}

function SupplierRow({ supplier }: { supplier: Supplier }) {
  const [isEditing, setIsEditing] = useState(false);

  const [editState, editAction, isSaving] = useActionState(
    updateSupplier,
    initialCatalogState,
  );
  const [activeState, activeAction, isToggling] = useActionState(
    setSupplierActive,
    initialCatalogState,
  );
  const [deleteState, deleteAction, isDeleting] = useActionState(
    deleteSupplier,
    initialCatalogState,
  );

  const rowError = editState.error ?? activeState.error ?? deleteState.error;

  if (isEditing) {
    return (
      <div className="rounded-lg border border-border-primary bg-bg-secondary/40 p-3">
        <form action={editAction} className="flex flex-col gap-3">
          <input type="hidden" name="id" value={supplier.id} />
          <div className="flex flex-col gap-2">
            <Label htmlFor={`supplier-name-${supplier.id}`}>Название</Label>
            <Input
              id={`supplier-name-${supplier.id}`}
              name="name"
              defaultValue={supplier.name}
              required
            />
          </div>
          <SupplierFields
            idPrefix={`supplier-${supplier.id}`}
            supplier={supplier}
          />
          <div className="flex items-center gap-2">
            <Button type="submit" size="sm" disabled={isSaving}>
              {isSaving ? "…" : "Сохранить"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setIsEditing(false)}
            >
              Отмена
            </Button>
          </div>
        </form>
        <FormError error={editState.error} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border-primary bg-bg-secondary/40 p-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-sm font-medium text-text-primary">
            {supplier.name}
          </span>
          {supplier.contact_person || supplier.phone || supplier.email ? (
            <span className="truncate text-xs text-text-secondary">
              {[supplier.contact_person, supplier.phone, supplier.email]
                .filter(Boolean)
                .join(" · ")}
            </span>
          ) : null}
        </div>
        <Badge variant="accent">
          {SOURCING_STATUS_LABELS[supplier.sourcing_status]}
        </Badge>
        {supplier.works_in_zapros ? (
          <Badge variant="success">Работает в Zapros</Badge>
        ) : null}
        <StatusBadge isActive={supplier.is_active} />
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setIsEditing(true)}
        >
          Изменить
        </Button>
        <form action={activeAction}>
          <input type="hidden" name="id" value={supplier.id} />
          <input
            type="hidden"
            name="is_active"
            value={(!supplier.is_active).toString()}
          />
          <Button
            type="submit"
            size="sm"
            variant="secondary"
            disabled={isToggling}
          >
            {supplier.is_active ? "Деактивировать" : "Активировать"}
          </Button>
        </form>
        <form action={deleteAction}>
          <input type="hidden" name="id" value={supplier.id} />
          <Button
            type="submit"
            size="sm"
            variant="destructive"
            disabled={isDeleting}
          >
            Удалить
          </Button>
        </form>
      </div>
      <FormError error={rowError} />
    </div>
  );
}

function StatusBadge({ isActive }: { isActive: boolean }) {
  return (
    <span
      className={
        isActive
          ? "rounded-md border border-success-border bg-success-bg px-2 py-0.5 text-xs font-medium text-success"
          : "rounded-md border border-border-primary bg-bg-secondary px-2 py-0.5 text-xs font-medium text-text-muted"
      }
    >
      {isActive ? "Активен" : "Неактивен"}
    </span>
  );
}

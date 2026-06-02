"use client";

import { useActionState, useMemo, useState } from "react";

import {
  initialCatalogState,
  type Supplier,
  type SupplierGroup,
  type SupplierGroupMember,
} from "@/actions/admin-catalog-types";
import {
  createGroup,
  deleteGroup,
  setGroupMembers,
  updateGroup,
} from "@/actions/admin-catalog";
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

import { FormError } from "./form-error";

interface GroupManagerProps {
  groups: SupplierGroup[];
  suppliers: Supplier[];
  members: SupplierGroupMember[];
}

/**
 * Admin UI for supplier groups: create groups, rename/reorder/delete them, and
 * manage many-to-many membership through a parent-group + supplier-checkbox
 * tree (see "Дерево поставщиков" in the kanban/filters UX doc).
 */
export function GroupManager({ groups, suppliers, members }: GroupManagerProps) {
  const membersByGroup = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const member of members) {
      const set = map.get(member.group_id) ?? new Set<string>();
      set.add(member.supplier_id);
      map.set(member.group_id, set);
    }
    return map;
  }, [members]);

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <CreateGroupForm />

      {groups.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Группы</CardTitle>
            <CardDescription>
              Список пуст — создайте первую группу.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        groups.map((group) => (
          <GroupCard
            key={group.id}
            group={group}
            suppliers={suppliers}
            memberIds={membersByGroup.get(group.id) ?? new Set<string>()}
          />
        ))
      )}
    </div>
  );
}

function CreateGroupForm() {
  const [state, formAction, isPending] = useActionState(
    createGroup,
    initialCatalogState,
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Новая группа</CardTitle>
        <CardDescription>
          Группа объединяет поставщиков для выбора при отправке запроса.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          action={formAction}
          className="flex flex-col gap-3 sm:flex-row sm:items-end"
        >
          <div className="flex flex-1 flex-col gap-2">
            <Label htmlFor="new-group-name">Название</Label>
            <Input
              id="new-group-name"
              name="name"
              placeholder="Например, мск_Опт"
              required
            />
          </div>
          <div className="flex w-28 flex-col gap-2">
            <Label htmlFor="new-group-sort">Порядок</Label>
            <Input
              id="new-group-sort"
              name="sort_order"
              type="number"
              min={0}
              step={1}
              defaultValue={0}
            />
          </div>
          <Button type="submit" disabled={isPending}>
            {isPending ? "Создание…" : "Создать"}
          </Button>
        </form>
        <FormError error={state.error} />
      </CardContent>
    </Card>
  );
}

function GroupCard({
  group,
  suppliers,
  memberIds,
}: {
  group: SupplierGroup;
  suppliers: Supplier[];
  memberIds: Set<string>;
}) {
  const [isEditing, setIsEditing] = useState(false);

  const [editState, editAction, isSaving] = useActionState(
    updateGroup,
    initialCatalogState,
  );
  const [deleteState, deleteAction, isDeleting] = useActionState(
    deleteGroup,
    initialCatalogState,
  );

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
        {isEditing ? (
          <form
            action={editAction}
            className="flex flex-1 flex-wrap items-end gap-2"
          >
            <input type="hidden" name="id" value={group.id} />
            <div className="flex flex-1 flex-col gap-2">
              <Label htmlFor={`group-name-${group.id}`}>Название</Label>
              <Input
                id={`group-name-${group.id}`}
                name="name"
                defaultValue={group.name}
                required
              />
            </div>
            <div className="flex w-24 flex-col gap-2">
              <Label htmlFor={`group-sort-${group.id}`}>Порядок</Label>
              <Input
                id={`group-sort-${group.id}`}
                name="sort_order"
                type="number"
                min={0}
                step={1}
                defaultValue={group.sort_order}
              />
            </div>
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
          </form>
        ) : (
          <>
            <div className="flex flex-col gap-1">
              <CardTitle>{group.name}</CardTitle>
              <CardDescription>Порядок: {group.sort_order}</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setIsEditing(true)}
              >
                Изменить
              </Button>
              <form action={deleteAction}>
                <input type="hidden" name="id" value={group.id} />
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
          </>
        )}
      </CardHeader>

      <CardContent>
        <FormError error={editState.error ?? deleteState.error} />
        <MembershipForm
          group={group}
          suppliers={suppliers}
          memberIds={memberIds}
        />
      </CardContent>
    </Card>
  );
}

function MembershipForm({
  group,
  suppliers,
  memberIds,
}: {
  group: SupplierGroup;
  suppliers: Supplier[];
  memberIds: Set<string>;
}) {
  const [state, formAction, isPending] = useActionState(
    setGroupMembers,
    initialCatalogState,
  );

  if (suppliers.length === 0) {
    return (
      <p className="text-sm text-text-secondary">
        Нет поставщиков. Добавьте их в разделе «Поставщики».
      </p>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="groupId" value={group.id} />
      <p className="text-sm font-medium text-text-primary">
        Состав группы ({memberIds.size} из {suppliers.length})
      </p>
      <div className="flex flex-col gap-1 rounded-lg border border-border-primary bg-bg-secondary/40 p-2">
        {suppliers.map((supplier) => (
          <label
            key={supplier.id}
            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-text-primary hover:bg-bg-secondary"
          >
            <input
              type="checkbox"
              name="supplierId"
              value={supplier.id}
              defaultChecked={memberIds.has(supplier.id)}
              className="size-4 rounded border-border-strong accent-accent-primary"
            />
            <span className="flex-1">{supplier.name}</span>
            {!supplier.is_active ? (
              <span className="text-xs text-text-muted">неактивен</span>
            ) : null}
          </label>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" size="sm" disabled={isPending}>
          {isPending ? "Сохранение…" : "Сохранить состав"}
        </Button>
        {state.ok ? (
          <span className="text-sm text-success">Сохранено.</span>
        ) : null}
      </div>
      <FormError error={state.error} />
    </form>
  );
}

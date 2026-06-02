"use client";

import { useActionState, useState } from "react";

import {
  initialCatalogState,
  type BitrixSetting,
} from "@/actions/admin-catalog-types";
import {
  createBitrixSetting,
  deleteBitrixSetting,
  updateBitrixSetting,
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

const TASK_ID_HINT =
  "Шаблон должен содержать {task_id} — туда подставится номер задачи Bitrix.";

interface BitrixManagerProps {
  settings: BitrixSetting[];
}

/**
 * Admin CRUD for Bitrix group URL templates (`bitrix_group_settings`). The
 * `name` column is unique; conflicts surface as a friendly error from the
 * server action.
 */
export function BitrixManager({ settings }: BitrixManagerProps) {
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <CreateBitrixForm />

      <Card>
        <CardHeader>
          <CardTitle>Шаблоны ссылок Bitrix</CardTitle>
          <CardDescription>
            {settings.length > 0
              ? `Всего: ${settings.length}`
              : "Список пуст — добавьте первый шаблон."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {settings.map((setting) => (
            <BitrixRow key={setting.id} setting={setting} />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function CreateBitrixForm() {
  const [state, formAction, isPending] = useActionState(
    createBitrixSetting,
    initialCatalogState,
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Новый шаблон</CardTitle>
        <CardDescription>{TASK_ID_HINT}</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="flex flex-col gap-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor="new-bitrix-name">Название группы</Label>
            <Input
              id="new-bitrix-name"
              name="name"
              placeholder="мск_Утеплитель"
              required
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="new-bitrix-url">URL-шаблон</Label>
            <Input
              id="new-bitrix-url"
              name="url_template"
              placeholder="https://.../task/view/{task_id}/"
              required
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-text-primary">
            <input
              type="checkbox"
              name="is_active"
              defaultChecked
              className="size-4 rounded border-border-strong accent-accent-primary"
            />
            Активен
          </label>
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

function BitrixRow({ setting }: { setting: BitrixSetting }) {
  const [isEditing, setIsEditing] = useState(false);

  const [editState, editAction, isSaving] = useActionState(
    updateBitrixSetting,
    initialCatalogState,
  );
  const [deleteState, deleteAction, isDeleting] = useActionState(
    deleteBitrixSetting,
    initialCatalogState,
  );

  if (isEditing) {
    return (
      <div className="rounded-lg border border-border-primary bg-bg-secondary/40 p-3">
        <form action={editAction} className="flex flex-col gap-3">
          <input type="hidden" name="id" value={setting.id} />
          <div className="flex flex-col gap-2">
            <Label htmlFor={`bitrix-name-${setting.id}`}>Название группы</Label>
            <Input
              id={`bitrix-name-${setting.id}`}
              name="name"
              defaultValue={setting.name}
              required
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={`bitrix-url-${setting.id}`}>URL-шаблон</Label>
            <Input
              id={`bitrix-url-${setting.id}`}
              name="url_template"
              defaultValue={setting.url_template}
              required
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-text-primary">
            <input
              type="checkbox"
              name="is_active"
              defaultChecked={setting.is_active}
              className="size-4 rounded border-border-strong accent-accent-primary"
            />
            Активен
          </label>
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
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="text-sm font-medium text-text-primary">
            {setting.name}
            {!setting.is_active ? (
              <span className="ml-2 text-xs text-text-muted">(неактивен)</span>
            ) : null}
          </span>
          <span className="truncate text-xs text-text-secondary">
            {setting.url_template}
          </span>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setIsEditing(true)}
        >
          Изменить
        </Button>
        <form action={deleteAction}>
          <input type="hidden" name="id" value={setting.id} />
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
      <FormError error={deleteState.error} />
    </div>
  );
}

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { useMemo, useState, useTransition } from "react";

import { createTask, type CreateTaskResult } from "@/actions/tasks";
import {
  parseBitrixPaste,
  type ParsedTaskItem,
  type ParsedTaskPreview,
  type PaymentForm,
} from "@/lib/parser/bitrix";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

/** Editable product row backed by string inputs (quantity is parsed on save). */
interface ItemRow {
  name: string;
  quantity: string;
  unit: string;
  comment: string;
}

/**
 * String-backed mirror of {@link ParsedTaskPreview} for controlled inputs.
 * `null` parser values become empty strings here and are converted back on save.
 */
interface FormState {
  bitrix_task_number: string;
  title: string;
  manager_name: string;
  delivery_address: string;
  purposes: string;
  category: string;
  deal_title: string;
  delivery_date: string;
  requested_at: string;
  payment_form: "" | PaymentForm;
  items: ItemRow[];
}

const EMPTY_ITEM: ItemRow = { name: "", quantity: "", unit: "", comment: "" };

/** Map a parsed preview into the string-backed form state. */
function previewToForm(preview: ParsedTaskPreview): FormState {
  return {
    bitrix_task_number:
      preview.bitrix_task_number !== null
        ? String(preview.bitrix_task_number)
        : "",
    title: preview.title ?? "",
    manager_name: preview.manager_name ?? "",
    delivery_address: preview.delivery_address ?? "",
    purposes: preview.purposes ?? "",
    category: preview.category ?? "",
    deal_title: preview.deal_title ?? "",
    delivery_date: preview.delivery_date ?? "",
    requested_at: preview.requested_at ?? "",
    payment_form: preview.payment_form ?? "",
    items:
      preview.items.length > 0
        ? preview.items.map(itemToRow)
        : [{ ...EMPTY_ITEM }],
  };
}

function itemToRow(item: ParsedTaskItem): ItemRow {
  return {
    name: item.name,
    quantity: item.quantity !== null ? String(item.quantity) : "",
    unit: item.unit ?? "",
    comment: item.comment ?? "",
  };
}

/** Normalize a trimmed string to its value or `null` when empty. */
function nullable(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Parse a quantity input ("1,5", "20") into a finite number or `null`. */
function parseQuantity(value: string): number | null {
  const trimmed = value.trim().replace(",", ".");
  if (trimmed.length === 0) return null;
  const parsed = Number.parseFloat(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function rowToItem(row: ItemRow): ParsedTaskItem {
  return {
    name: row.name.trim(),
    quantity: parseQuantity(row.quantity),
    unit: nullable(row.unit),
    comment: nullable(row.comment),
  };
}

/** Assemble the server payload from the current form state and original paste. */
function formToPreview(form: FormState, raw: string): ParsedTaskPreview {
  const taskNumber = Number.parseInt(form.bitrix_task_number, 10);
  return {
    bitrix_task_number: Number.isInteger(taskNumber) ? taskNumber : null,
    manager_name: nullable(form.manager_name),
    delivery_address: nullable(form.delivery_address),
    purposes: nullable(form.purposes),
    payment_form: form.payment_form === "" ? null : form.payment_form,
    delivery_date: nullable(form.delivery_date),
    category: nullable(form.category),
    deal_title: nullable(form.deal_title),
    requested_at: nullable(form.requested_at),
    title: nullable(form.title),
    items: form.items
      .map(rowToItem)
      .filter((item) => item.name.length > 0),
    raw_paste: raw,
  };
}

/** Client-side validation mirroring the server's `validatePreview`. */
function validate(form: FormState): string[] {
  const errors: string[] = [];

  const taskNumber = Number.parseInt(form.bitrix_task_number, 10);
  if (
    form.bitrix_task_number.trim().length === 0 ||
    !Number.isInteger(taskNumber) ||
    taskNumber <= 0
  ) {
    errors.push("Укажите корректный номер задачи Bitrix (целое число больше 0).");
  }

  const hasNamedItem = form.items.some((item) => item.name.trim().length > 0);
  if (!hasNamedItem) {
    errors.push("Добавьте хотя бы одну позицию с названием.");
  }

  if (form.delivery_date.trim().length > 0 && !isValidIsoDate(form.delivery_date)) {
    errors.push("Дата поставки указана в неверном формате.");
  }

  return errors;
}

/** True when `value` is a valid ISO `YYYY-MM-DD` calendar date. */
function isValidIsoDate(value: string): boolean {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const [, year, month, day] = match;
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return false;
  return (
    date.getUTCFullYear() === Number(year) &&
    date.getUTCMonth() + 1 === Number(month) &&
    date.getUTCDate() === Number(day)
  );
}

export function NewTaskForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [raw, setRaw] = useState("");
  const [form, setForm] = useState<FormState | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [duplicateTaskId, setDuplicateTaskId] = useState<string | null>(null);

  const errors = useMemo(() => (form ? validate(form) : []), [form]);
  const canSave = form !== null && errors.length === 0 && !isPending;

  function handleParse() {
    setForm(previewToForm(parseBitrixPaste(raw)));
    setSaveError(null);
    setDuplicateTaskId(null);
  }

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => (current ? { ...current, [key]: value } : current));
  }

  function updateItem(index: number, key: keyof ItemRow, value: string) {
    setForm((current) => {
      if (!current) return current;
      const items = current.items.map((item, i) =>
        i === index ? { ...item, [key]: value } : item,
      );
      return { ...current, items };
    });
  }

  function addItem() {
    setForm((current) =>
      current ? { ...current, items: [...current.items, { ...EMPTY_ITEM }] } : current,
    );
  }

  function removeItem(index: number) {
    setForm((current) => {
      if (!current) return current;
      const items = current.items.filter((_, i) => i !== index);
      return { ...current, items: items.length > 0 ? items : [{ ...EMPTY_ITEM }] };
    });
  }

  function handleSave() {
    if (!form || errors.length > 0) return;
    setSaveError(null);
    setDuplicateTaskId(null);

    const payload = formToPreview(form, raw);
    startTransition(async () => {
      const result: CreateTaskResult = await createTask(payload);
      if (result.ok) {
        router.push(`/app/tasks/${result.taskId}`);
        return;
      }
      setSaveError(result.error);
      setDuplicateTaskId(result.duplicateTaskId ?? null);
    });
  }

  return (
    <div className="space-y-6">
      <PasteStep
        raw={raw}
        onChange={setRaw}
        onParse={handleParse}
        hasForm={form !== null}
      />

      {form !== null && (
        <PreviewStep
          form={form}
          errors={errors}
          canSave={canSave}
          isPending={isPending}
          saveError={saveError}
          duplicateTaskId={duplicateTaskId}
          onFieldChange={updateField}
          onItemChange={updateItem}
          onAddItem={addItem}
          onRemoveItem={removeItem}
          onSave={handleSave}
        />
      )}
    </div>
  );
}

interface PasteStepProps {
  raw: string;
  hasForm: boolean;
  onChange: (value: string) => void;
  onParse: () => void;
}

function PasteStep({ raw, hasForm, onChange, onParse }: PasteStepProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Шаг 1. Вставка из Bitrix</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="raw-paste">Текст задачи</Label>
          <Textarea
            id="raw-paste"
            value={raw}
            onChange={(event) => onChange(event.target.value)}
            placeholder="Вставьте сюда скопированный текст задачи из Bitrix24…"
            className="min-h-48 font-mono"
          />
        </div>
        <Button type="button" onClick={onParse} disabled={raw.trim().length === 0}>
          {hasForm ? "Разобрать заново" : "Разобрать"}
        </Button>
      </CardContent>
    </Card>
  );
}

interface PreviewStepProps {
  form: FormState;
  errors: string[];
  canSave: boolean;
  isPending: boolean;
  saveError: string | null;
  duplicateTaskId: string | null;
  onFieldChange: <K extends keyof FormState>(key: K, value: FormState[K]) => void;
  onItemChange: (index: number, key: keyof ItemRow, value: string) => void;
  onAddItem: () => void;
  onRemoveItem: (index: number) => void;
  onSave: () => void;
}

function PreviewStep({
  form,
  errors,
  canSave,
  isPending,
  saveError,
  duplicateTaskId,
  onFieldChange,
  onItemChange,
  onAddItem,
  onRemoveItem,
  onSave,
}: PreviewStepProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Шаг 2. Проверьте и отредактируйте задачу</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Номер задачи Bitrix" htmlFor="bitrix_task_number">
            <Input
              id="bitrix_task_number"
              type="number"
              min={1}
              step={1}
              value={form.bitrix_task_number}
              onChange={(e) => onFieldChange("bitrix_task_number", e.target.value)}
            />
          </Field>
          <Field label="Заголовок" htmlFor="title">
            <Input
              id="title"
              value={form.title}
              onChange={(e) => onFieldChange("title", e.target.value)}
            />
          </Field>
          <Field label="Менеджер" htmlFor="manager_name">
            <Input
              id="manager_name"
              value={form.manager_name}
              onChange={(e) => onFieldChange("manager_name", e.target.value)}
            />
          </Field>
          <Field label="Адрес доставки" htmlFor="delivery_address">
            <Input
              id="delivery_address"
              value={form.delivery_address}
              onChange={(e) => onFieldChange("delivery_address", e.target.value)}
            />
          </Field>
          <Field label="Цели" htmlFor="purposes">
            <Input
              id="purposes"
              value={form.purposes}
              onChange={(e) => onFieldChange("purposes", e.target.value)}
            />
          </Field>
          <Field label="Категория (группа Bitrix)" htmlFor="category">
            <Input
              id="category"
              value={form.category}
              onChange={(e) => onFieldChange("category", e.target.value)}
            />
          </Field>
          <Field label="Сделка" htmlFor="deal_title">
            <Input
              id="deal_title"
              value={form.deal_title}
              onChange={(e) => onFieldChange("deal_title", e.target.value)}
            />
          </Field>
          <Field label="Дата поставки" htmlFor="delivery_date">
            <Input
              id="delivery_date"
              type="date"
              value={form.delivery_date}
              onChange={(e) => onFieldChange("delivery_date", e.target.value)}
            />
          </Field>
          <Field label="Дата запроса снабженцу" htmlFor="requested_at">
            <Input
              id="requested_at"
              type="datetime-local"
              value={form.requested_at}
              onChange={(e) => onFieldChange("requested_at", e.target.value)}
            />
          </Field>
          <Field label="Форма оплаты" htmlFor="payment_form">
            <Select
              id="payment_form"
              value={form.payment_form}
              onChange={(e) =>
                onFieldChange("payment_form", e.target.value as "" | PaymentForm)
              }
            >
              <option value="">Не указана</option>
              <option value="cash">Наличные</option>
              <option value="non_cash">Безналичные</option>
            </Select>
          </Field>
        </div>

        <ItemsTable
          items={form.items}
          onItemChange={onItemChange}
          onAddItem={onAddItem}
          onRemoveItem={onRemoveItem}
        />

        {duplicateTaskId !== null ? (
          <div
            role="alert"
            className="rounded-lg border border-danger-border bg-danger-bg p-4 text-sm text-danger"
          >
            <p>
              {saveError ?? "Задача с таким номером Bitrix уже существует."}
            </p>
            <Link
              href={`/app/tasks/${duplicateTaskId}`}
              className="mt-2 inline-block font-medium underline underline-offset-4"
            >
              Открыть существующую задачу
            </Link>
          </div>
        ) : saveError !== null ? (
          <div
            role="alert"
            className="rounded-lg border border-danger-border bg-danger-bg p-4 text-sm text-danger"
          >
            {saveError}
          </div>
        ) : null}

        {errors.length > 0 && (
          <ul className="space-y-1 text-sm text-danger">
            {errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        )}

        <div className="flex items-center gap-3">
          <Button type="button" onClick={onSave} disabled={!canSave}>
            {isPending ? "Сохранение…" : "Сохранить"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

interface FieldProps {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}

function Field({ label, htmlFor, children }: FieldProps) {
  return (
    <div className="space-y-2">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}

interface ItemsTableProps {
  items: ItemRow[];
  onItemChange: (index: number, key: keyof ItemRow, value: string) => void;
  onAddItem: () => void;
  onRemoveItem: (index: number) => void;
}

function ItemsTable({
  items,
  onItemChange,
  onAddItem,
  onRemoveItem,
}: ItemsTableProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-text-primary">Позиции</h2>
        <Button type="button" variant="outline" size="sm" onClick={onAddItem}>
          <Plus />
          Добавить строку
        </Button>
      </div>

      <div className="space-y-3">
        <div className="hidden gap-3 px-1 text-xs font-medium text-text-secondary sm:grid sm:grid-cols-[2fr_1fr_1fr_2fr_auto]">
          <span>Товар</span>
          <span>Кол-во</span>
          <span>Ед.</span>
          <span>Комментарий</span>
          <span className="sr-only">Действия</span>
        </div>

        {items.map((item, index) => (
          <div
            key={index}
            className="grid grid-cols-1 gap-3 rounded-lg border border-border-primary p-3 sm:grid-cols-[2fr_1fr_1fr_2fr_auto] sm:items-center sm:border-0 sm:p-0"
          >
            <Input
              aria-label="Товар"
              placeholder="Товар"
              value={item.name}
              onChange={(e) => onItemChange(index, "name", e.target.value)}
            />
            <Input
              aria-label="Количество"
              placeholder="Кол-во"
              type="number"
              min={0}
              step="any"
              value={item.quantity}
              onChange={(e) => onItemChange(index, "quantity", e.target.value)}
            />
            <Input
              aria-label="Единица измерения"
              placeholder="Ед."
              value={item.unit}
              onChange={(e) => onItemChange(index, "unit", e.target.value)}
            />
            <Input
              aria-label="Комментарий"
              placeholder="Комментарий"
              value={item.comment}
              onChange={(e) => onItemChange(index, "comment", e.target.value)}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Удалить строку"
              onClick={() => onRemoveItem(index)}
              className="justify-self-end text-text-secondary hover:text-danger"
            >
              <X />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

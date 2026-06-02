"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import {
  createRequestDraft,
  sendRequest,
  type CreateRequestDraftResult,
  type SendRequestResult,
} from "@/actions/requests";
import {
  SupplierPicker,
  type PickerGroup,
  type PickerSupplier,
} from "@/components/requests/supplier-picker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { PaymentForm } from "@/lib/parser/bitrix";

/** A selectable task position shown in the preview step. */
export interface RequestItemOption {
  id: string;
  name: string;
  quantity: number | null;
  unit: string | null;
}

interface CreateRequestFormProps {
  taskId: string;
  /** Read-only payment form copied from the task onto the draft. */
  paymentForm: PaymentForm | null;
  /** Every position of the task, selectable via checkboxes. */
  items: RequestItemOption[];
  /** Position ids pre-selected from the task card (via query string). */
  initialSelectedItemIds: string[];
  /** Suppliers available for selection, grouped for the picker tree. */
  suppliers: PickerSupplier[];
  groups: PickerGroup[];
  ungroupedSupplierIds: string[];
}

/** Wizard step. Selection/options first, supplier picking second. */
type Step = "preview" | "suppliers";

/** Successful-send summary kept to render the confirmation screen. */
interface SendSuccess {
  requestId: string;
  requestCode: string;
  invitedCount: number;
  skippedCount: number;
}

const PAYMENT_FORM_LABELS: Record<PaymentForm, string> = {
  cash: "Наличные",
  non_cash: "Безналичные",
};

const CHECKBOX_CLASS =
  "size-4 rounded border-border-strong accent-accent-primary disabled:opacity-50";

const EMPTY = "—";

/** Keep only ids that still exist among the task's items. */
function sanitizeInitialSelection(
  initial: string[],
  items: RequestItemOption[],
): Set<string> {
  const valid = new Set(items.map((item) => item.id));
  return new Set(initial.filter((id) => valid.has(id)));
}

/**
 * Client wizard for creating and sending a request from a task (F002 / REQ-006).
 *
 * Step 1 «Превью»: pick which task positions go into the request, view the
 * read-only payment form, toggle `needs_delivery` and add an optional comment.
 * Step 2 «Поставщики»: choose recipients via {@link SupplierPicker}; sending is
 * only enabled once at least one in-system supplier is selected.
 *
 * On submit it creates the draft (`createRequestDraft`) and immediately sends it
 * (`sendRequest`); both server actions return discriminated results that are
 * surfaced as inline errors. Success shows a confirmation with the request code
 * and a link back to the task (whose positions now read «В запросе»).
 */
export function CreateRequestForm({
  taskId,
  paymentForm,
  items,
  initialSelectedItemIds,
  suppliers,
  groups,
  ungroupedSupplierIds,
}: CreateRequestFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [step, setStep] = useState<Step>("preview");
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(() =>
    sanitizeInitialSelection(initialSelectedItemIds, items),
  );
  const [needsDelivery, setNeedsDelivery] = useState(false);
  const [comment, setComment] = useState("");
  const [supplierIds, setSupplierIds] = useState<string[]>([]);
  const [manualIds, setManualIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<SendSuccess | null>(null);

  const selectedItems = useMemo(
    () => items.filter((item) => selectedItemIds.has(item.id)),
    [items, selectedItemIds],
  );

  const hasSelectedItems = selectedItemIds.size > 0;
  const hasSystemSupplier = supplierIds.length > 0;

  function toggleItem(id: string) {
    setSelectedItemIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleSubmit() {
    if (!hasSelectedItems || !hasSystemSupplier || isPending) return;
    setError(null);

    const itemIds = Array.from(selectedItemIds);
    const trimmedComment = comment.trim();

    startTransition(async () => {
      const draft: CreateRequestDraftResult = await createRequestDraft(
        taskId,
        itemIds,
      );
      if (!draft.ok) {
        setError(draft.error);
        return;
      }

      const sent: SendRequestResult = await sendRequest(draft.requestId, {
        supplierIds,
        needsDelivery,
        comment: trimmedComment.length > 0 ? trimmedComment : null,
      });
      if (!sent.ok) {
        setError(sent.error);
        return;
      }

      // The draft now exists and is sent; the task's positions moved to
      // `in_request`, so refresh any cached task view in the background.
      router.refresh();
      setSuccess({
        requestId: sent.requestId,
        requestCode: draft.requestCode,
        invitedCount: sent.invitedSupplierIds.length,
        skippedCount: sent.skippedSupplierIds.length,
      });
    });
  }

  if (success) {
    return (
      <SuccessCard taskId={taskId} success={success} />
    );
  }

  return (
    <div className="space-y-6">
      <StepIndicator step={step} />

      {step === "preview" ? (
        <PreviewStep
          items={items}
          selectedItemIds={selectedItemIds}
          onToggleItem={toggleItem}
          paymentForm={paymentForm}
          needsDelivery={needsDelivery}
          onNeedsDeliveryChange={setNeedsDelivery}
          comment={comment}
          onCommentChange={setComment}
          canContinue={hasSelectedItems}
          onContinue={() => {
            setError(null);
            setStep("suppliers");
          }}
        />
      ) : (
        <SuppliersStep
          selectedItems={selectedItems}
          suppliers={suppliers}
          groups={groups}
          ungroupedSupplierIds={ungroupedSupplierIds}
          supplierIds={supplierIds}
          onSupplierChange={setSupplierIds}
          manualIds={manualIds}
          onManualChange={setManualIds}
          canSend={hasSystemSupplier && hasSelectedItems}
          isPending={isPending}
          error={error}
          onBack={() => {
            setError(null);
            setStep("preview");
          }}
          onSend={handleSubmit}
        />
      )}
    </div>
  );
}

function StepIndicator({ step }: { step: Step }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span
        className={
          step === "preview"
            ? "font-semibold text-text-primary"
            : "text-text-secondary"
        }
      >
        1. Превью
      </span>
      <span className="text-text-muted">→</span>
      <span
        className={
          step === "suppliers"
            ? "font-semibold text-text-primary"
            : "text-text-secondary"
        }
      >
        2. Поставщики
      </span>
    </div>
  );
}

interface PreviewStepProps {
  items: RequestItemOption[];
  selectedItemIds: Set<string>;
  onToggleItem: (id: string) => void;
  paymentForm: PaymentForm | null;
  needsDelivery: boolean;
  onNeedsDeliveryChange: (value: boolean) => void;
  comment: string;
  onCommentChange: (value: string) => void;
  canContinue: boolean;
  onContinue: () => void;
}

function PreviewStep({
  items,
  selectedItemIds,
  onToggleItem,
  paymentForm,
  needsDelivery,
  onNeedsDeliveryChange,
  comment,
  onCommentChange,
  canContinue,
  onContinue,
}: PreviewStepProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Шаг 1. Позиции и условия запроса</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-text-primary">
            Позиции запроса
          </h3>
          {items.length === 0 ? (
            <p className="text-sm text-text-secondary">
              У задачи нет позиций для запроса.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-table-border">
              <table className="w-full border-collapse text-sm">
                <thead className="bg-table-header-bg text-text-secondary">
                  <tr>
                    <th className="w-10 px-3 py-2 text-left font-medium" />
                    <th className="px-3 py-2 text-left font-medium">Товар</th>
                    <th className="px-3 py-2 text-right font-medium">Кол-во</th>
                    <th className="px-3 py-2 text-left font-medium">Ед.</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => {
                    const isSelected = selectedItemIds.has(item.id);
                    return (
                      <tr
                        key={item.id}
                        className={`border-t border-table-border ${
                          isSelected
                            ? "bg-table-row-selected"
                            : "bg-table-bg"
                        }`}
                      >
                        <td className="px-3 py-2 align-top">
                          <input
                            type="checkbox"
                            aria-label={`Включить позицию «${item.name}»`}
                            className={CHECKBOX_CLASS}
                            checked={isSelected}
                            onChange={() => onToggleItem(item.id)}
                          />
                        </td>
                        <td className="px-3 py-2 align-top font-medium text-text-primary">
                          {item.name}
                        </td>
                        <td className="px-3 py-2 text-right align-top text-text-primary tabular-nums">
                          {item.quantity ?? EMPTY}
                        </td>
                        <td className="px-3 py-2 align-top text-text-secondary">
                          {item.unit ?? EMPTY}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-sm text-text-secondary">
            Выбрано позиций: {selectedItemIds.size}
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <Label>Форма оплаты</Label>
            <p className="text-sm text-text-primary">
              {paymentForm ? PAYMENT_FORM_LABELS[paymentForm] : EMPTY}
            </p>
            <p className="text-xs text-text-muted">
              Копируется из задачи и не редактируется.
            </p>
          </div>

          <div className="space-y-1">
            <Label htmlFor="needs-delivery">Доставка</Label>
            <label className="flex items-center gap-2 text-sm text-text-primary">
              <input
                id="needs-delivery"
                type="checkbox"
                className={CHECKBOX_CLASS}
                checked={needsDelivery}
                onChange={(event) =>
                  onNeedsDeliveryChange(event.target.checked)
                }
              />
              Нужна доставка
            </label>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="request-comment">Комментарий (необязательно)</Label>
          <Textarea
            id="request-comment"
            value={comment}
            onChange={(event) => onCommentChange(event.target.value)}
            placeholder="Комментарий для поставщиков…"
            className="min-h-24"
          />
        </div>

        <div className="flex items-center gap-3">
          <Button type="button" onClick={onContinue} disabled={!canContinue}>
            Далее: поставщики
          </Button>
          {!canContinue ? (
            <span className="text-sm text-text-secondary">
              Выберите хотя бы одну позицию.
            </span>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

interface SuppliersStepProps {
  selectedItems: RequestItemOption[];
  suppliers: PickerSupplier[];
  groups: PickerGroup[];
  ungroupedSupplierIds: string[];
  supplierIds: string[];
  onSupplierChange: (ids: string[]) => void;
  manualIds: string[];
  onManualChange: (ids: string[]) => void;
  canSend: boolean;
  isPending: boolean;
  error: string | null;
  onBack: () => void;
  onSend: () => void;
}

function SuppliersStep({
  selectedItems,
  suppliers,
  groups,
  ungroupedSupplierIds,
  supplierIds,
  onSupplierChange,
  manualIds,
  onManualChange,
  canSend,
  isPending,
  error,
  onBack,
  onSend,
}: SuppliersStepProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Шаг 2. Выбор поставщиков</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="rounded-lg border border-border-primary bg-bg-secondary/40 p-3 text-sm text-text-secondary">
          В запрос войдёт позиций: {selectedItems.length}
        </div>

        <SupplierPicker
          suppliers={suppliers}
          groups={groups}
          ungroupedSupplierIds={ungroupedSupplierIds}
          value={supplierIds}
          onChange={onSupplierChange}
          manualValue={manualIds}
          onManualChange={onManualChange}
        />

        {error ? (
          <div
            role="alert"
            className="rounded-lg border border-danger-border bg-danger-bg p-4 text-sm text-danger"
          >
            {error}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={onBack}
            disabled={isPending}
          >
            Назад
          </Button>
          <Button type="button" onClick={onSend} disabled={!canSend || isPending}>
            {isPending ? "Отправка…" : "Отправить запрос"}
          </Button>
          {!canSend ? (
            <span className="text-sm text-text-secondary">
              Выберите хотя бы одного поставщика внутри системы.
            </span>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

interface SuccessCardProps {
  taskId: string;
  success: SendSuccess;
}

function SuccessCard({ taskId, success }: SuccessCardProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle>Запрос отправлен</CardTitle>
          <Badge variant="success">{success.requestCode}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-text-primary">
          Приглашений создано: {success.invitedCount}.
          {success.skippedCount > 0
            ? ` Поставщиков вне системы (свяжитесь вручную): ${success.skippedCount}.`
            : ""}
        </p>
        <p className="text-sm text-text-secondary">
          Выбранные позиции теперь отмечены как «В запросе».
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href={`/app/requests/${success.requestId}`}
            className="text-sm font-medium text-accent-primary underline underline-offset-4"
          >
            Открыть запрос
          </Link>
          <Link
            href={`/app/tasks/${taskId}`}
            className="text-sm font-medium text-text-secondary underline underline-offset-4"
          >
            Вернуться к задаче
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

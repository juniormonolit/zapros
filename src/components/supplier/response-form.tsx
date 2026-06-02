"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import {
  submitResponseVersion,
  type SubmitLineInput,
  type SubmitResponseVersionResult,
} from "@/actions/responses";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { PaymentForm } from "@/lib/parser/bitrix";

/** Request line shown read-only in the response table. */
export interface ResponseFormItem {
  id: string;
  name: string;
  quantity: number | null;
  unit: string | null;
}

/** Version row for minimal history on the response page (RSP-007 overlap). */
export interface ResponseVersionSummary {
  id: string;
  versionNumber: number;
  isCurrent: boolean;
  comment: string | null;
  submittedAt: string;
}

interface ResponseFormProps {
  inviteId: string;
  requestCode: string;
  paymentForm: PaymentForm | null;
  needsDelivery: boolean;
  items: ResponseFormItem[];
  submitBlocked: boolean;
  blockedMessage: string | null;
  hasPriorVersions: boolean;
}

interface LineFormState {
  priceWithVat: string;
  priceCash: string;
  priceWithoutVat: string;
  deliveryPrice: string;
  priceIncludesDelivery: boolean;
  inStock: boolean;
  leadTimeDays: string;
  lineComment: string;
}

interface SubmitSuccess {
  versionNumber: number;
}

const CHECKBOX_CLASS =
  "size-4 rounded border-border-strong accent-accent-primary disabled:opacity-50";

const EMPTY = "—";

function emptyLineState(): LineFormState {
  return {
    priceWithVat: "",
    priceCash: "",
    priceWithoutVat: "",
    deliveryPrice: "",
    priceIncludesDelivery: false,
    inStock: false,
    leadTimeDays: "",
    lineComment: "",
  };
}

function buildInitialLines(items: ResponseFormItem[]): Record<string, LineFormState> {
  return Object.fromEntries(
    items.map((item) => [item.id, emptyLineState()]),
  );
}

function parseOptionalNumber(raw: string): number | null | "invalid" {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  const value = Number(trimmed.replace(",", "."));
  if (!Number.isFinite(value)) return "invalid";
  return value;
}

function isNonNegativeNumber(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

function isPositiveInteger(value: number): boolean {
  return Number.isFinite(value) && Number.isInteger(value) && value > 0;
}

/**
 * Client-side validation mirroring {@link submitResponseVersion} / `normalizeLines`.
 */
function validateForm(
  items: ResponseFormItem[],
  lines: Record<string, LineFormState>,
  paymentForm: PaymentForm | null,
  needsDelivery: boolean,
): string | null {
  const normalized: SubmitLineInput[] = [];
  const seenItemIds = new Set<string>();

  for (const item of items) {
    const state = lines[item.id] ?? emptyLineState();
    const requestItemId = item.id;

    if (seenItemIds.has(requestItemId)) {
      return "Позиция запроса указана более одного раза.";
    }
    seenItemIds.add(requestItemId);

    const hasInStock = state.inStock;
    const leadRaw = state.leadTimeDays.trim();
    const hasLeadTime = leadRaw.length > 0;

    if (hasInStock && hasLeadTime) {
      return "Укажите либо наличие, либо срок поставки, но не оба поля.";
    }

    let leadTimeDays: number | null = null;
    if (hasLeadTime) {
      const parsed = parseOptionalNumber(leadRaw);
      if (parsed === "invalid" || parsed === null) {
        return "Срок поставки должен быть целым числом больше нуля.";
      }
      if (!isPositiveInteger(parsed)) {
        return "Срок поставки должен быть целым числом больше нуля.";
      }
      leadTimeDays = parsed;
    }

    const deliveryParsed = parseOptionalNumber(state.deliveryPrice);
    if (deliveryParsed === "invalid") {
      return "Поле «доставка» не может быть отрицательным.";
    }
    const includesDelivery = state.priceIncludesDelivery;

    if (deliveryParsed != null && includesDelivery) {
      return "Укажите либо стоимость доставки, либо «цена с доставкой».";
    }

    if (!needsDelivery) {
      if (deliveryParsed != null) {
        return "Для этого запроса доставка не требуется.";
      }
      if (includesDelivery) {
        return "Для этого запроса доставка не требуется.";
      }
    }

    const priceWithVat = parseOptionalNumber(state.priceWithVat);
    const priceCash = parseOptionalNumber(state.priceCash);
    const priceWithoutVat = parseOptionalNumber(state.priceWithoutVat);

    const numericFields: { value: number | null | "invalid"; label: string }[] = [
      { value: priceWithVat, label: "цена с НДС" },
      { value: priceCash, label: "цена нал" },
      { value: priceWithoutVat, label: "цена без НДС" },
      { value: deliveryParsed, label: "доставка" },
    ];

    for (const { value, label } of numericFields) {
      if (value === "invalid") {
        return `Поле «${label}» должно быть числом.`;
      }
      if (value != null && !isNonNegativeNumber(value)) {
        return `Поле «${label}» не может быть отрицательным.`;
      }
    }

    if (paymentForm === "non_cash" && priceCash != null) {
      return "Для безналичной оплаты поле «нал» недоступно.";
    }

    const line: SubmitLineInput = {
      requestItemId,
      priceWithVat: priceWithVat === "invalid" ? null : priceWithVat,
      priceCash: priceCash === "invalid" ? null : priceCash,
      priceWithoutVat:
        priceWithoutVat === "invalid" ? null : priceWithoutVat,
      deliveryPrice: needsDelivery ? deliveryParsed : null,
      priceIncludesDelivery: needsDelivery ? includesDelivery : false,
      inStock: hasInStock ? true : null,
      leadTimeDays,
      lineComment:
        state.lineComment.trim().length > 0 ? state.lineComment.trim() : null,
    };

    const hasMeaningfulData =
      line.priceWithVat != null ||
      line.priceCash != null ||
      line.priceWithoutVat != null ||
      line.inStock != null ||
      line.leadTimeDays != null;

    if (hasMeaningfulData) {
      normalized.push(line);
    }
  }

  if (normalized.length === 0) {
    return "Заполните хотя бы одну строку: цена, наличие или срок поставки.";
  }

  return null;
}

function buildSubmitLines(
  items: ResponseFormItem[],
  lines: Record<string, LineFormState>,
  needsDelivery: boolean,
): SubmitLineInput[] {
  const result: SubmitLineInput[] = [];

  for (const item of items) {
    const state = lines[item.id] ?? emptyLineState();
    const priceWithVat = parseOptionalNumber(state.priceWithVat);
    const priceCash = parseOptionalNumber(state.priceCash);
    const priceWithoutVat = parseOptionalNumber(state.priceWithoutVat);
    const deliveryParsed = parseOptionalNumber(state.deliveryPrice);
    const leadRaw = state.leadTimeDays.trim();

    const line: SubmitLineInput = {
      requestItemId: item.id,
      priceWithVat:
        priceWithVat === "invalid" || priceWithVat === null
          ? null
          : priceWithVat,
      priceCash:
        priceCash === "invalid" || priceCash === null ? null : priceCash,
      priceWithoutVat:
        priceWithoutVat === "invalid" || priceWithoutVat === null
          ? null
          : priceWithoutVat,
      deliveryPrice:
        needsDelivery && deliveryParsed !== "invalid" && deliveryParsed != null
          ? deliveryParsed
          : null,
      priceIncludesDelivery: needsDelivery
        ? state.priceIncludesDelivery
        : false,
      inStock: state.inStock ? true : null,
      leadTimeDays:
        leadRaw.length > 0
          ? (() => {
              const parsed = parseOptionalNumber(leadRaw);
              return parsed === "invalid" || parsed === null ? null : parsed;
            })()
          : null,
      lineComment:
        state.lineComment.trim().length > 0 ? state.lineComment.trim() : null,
    };

    const hasMeaningfulData =
      line.priceWithVat != null ||
      line.priceCash != null ||
      line.priceWithoutVat != null ||
      line.inStock != null ||
      line.leadTimeDays != null;

    if (hasMeaningfulData) {
      result.push(line);
    }
  }

  return result;
}

function formatQuantity(item: ResponseFormItem): string {
  if (item.quantity == null) return EMPTY;
  return String(item.quantity);
}

/**
 * Supplier response form (F004 / RSP-006): per-line prices, delivery XOR,
 * stock XOR lead time, version comment, and submit to {@link submitResponseVersion}.
 */
export function ResponseForm({
  inviteId,
  requestCode,
  paymentForm,
  needsDelivery,
  items,
  submitBlocked,
  blockedMessage,
  hasPriorVersions,
}: ResponseFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [lines, setLines] = useState<Record<string, LineFormState>>(() =>
    buildInitialLines(items),
  );
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<SubmitSuccess | null>(null);

  const showCashPrice = paymentForm !== "non_cash";

  const submitLabel = useMemo(() => {
    if (hasPriorVersions) return "Отправить новую версию";
    return "Отправить ответ";
  }, [hasPriorVersions]);

  function updateLine(
    itemId: string,
    patch: Partial<LineFormState>,
  ): void {
    setLines((current) => ({
      ...current,
      [itemId]: { ...(current[itemId] ?? emptyLineState()), ...patch },
    }));
  }

  function handleSubmit(): void {
    if (submitBlocked || isPending) return;
    setError(null);

    const validationError = validateForm(
      items,
      lines,
      paymentForm,
      needsDelivery,
    );
    if (validationError) {
      setError(validationError);
      return;
    }

    const submitLines = buildSubmitLines(items, lines, needsDelivery);
    const trimmedComment = comment.trim();

    startTransition(async () => {
      const result: SubmitResponseVersionResult = await submitResponseVersion(
        inviteId,
        {
          comment: trimmedComment.length > 0 ? trimmedComment : null,
          lines: submitLines,
        },
      );

      if (!result.ok) {
        setError(result.error);
        return;
      }

      router.refresh();
      setSuccess({ versionNumber: result.versionNumber });
    });
  }

  if (success) {
    return (
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle>Ответ отправлен</CardTitle>
            <Badge variant="success">{requestCode}</Badge>
            <Badge variant="accent">Версия {success.versionNumber}</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-text-primary">
            Ваша версия {success.versionNumber} сохранена и отмечена как
            актуальная.
          </p>
          <Link
            href="/supplier"
            className="text-sm font-medium text-accent-primary underline underline-offset-4"
          >
            Вернуться к моим запросам
          </Link>
        </CardContent>
      </Card>
    );
  }

  if (submitBlocked && blockedMessage) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Ответ недоступен</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-text-secondary">{blockedMessage}</p>
          <Link href="/supplier" className={buttonVariants({ variant: "outline" })}>
            К моим запросам
          </Link>
        </CardContent>
      </Card>
    );
  }

  if (items.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Нет позиций для ответа</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-text-secondary">
            В этом запросе нет строк для заполнения цен.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {hasPriorVersions ? "Новая версия ответа" : "Заполните ответ"}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="overflow-x-auto rounded-lg border border-table-border">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead className="bg-table-header-bg text-text-secondary">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Товар</th>
                <th className="px-3 py-2 text-right font-medium">Кол-во</th>
                <th className="px-3 py-2 text-left font-medium">Ед.</th>
                <th className="px-3 py-2 text-right font-medium">С НДС</th>
                {showCashPrice ? (
                  <th className="px-3 py-2 text-right font-medium">Нал</th>
                ) : null}
                <th className="px-3 py-2 text-right font-medium">Без НДС</th>
                {needsDelivery ? (
                  <>
                    <th className="px-3 py-2 text-right font-medium">
                      Доставка
                    </th>
                    <th className="px-3 py-2 text-center font-medium">
                      С доставкой
                    </th>
                  </>
                ) : null}
                <th className="px-3 py-2 text-center font-medium">В наличии</th>
                <th className="px-3 py-2 text-right font-medium">
                  Срок, дн.
                </th>
                <th className="px-3 py-2 text-left font-medium">
                  Комментарий
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const state = lines[item.id] ?? emptyLineState();
                const leadDisabled = state.inStock;
                const stockDisabled = state.leadTimeDays.trim().length > 0;
                const deliveryDisabled = state.priceIncludesDelivery;

                return (
                  <tr
                    key={item.id}
                    className="border-t border-table-border bg-table-bg align-top"
                  >
                    <td className="px-3 py-2 font-medium text-text-primary">
                      {item.name}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-text-primary">
                      {formatQuantity(item)}
                    </td>
                    <td className="px-3 py-2 text-text-secondary">
                      {item.unit ?? EMPTY}
                    </td>
                    <td className="px-3 py-2">
                      <PriceInput
                        ariaLabel={`${item.name}: цена с НДС`}
                        value={state.priceWithVat}
                        onChange={(value) =>
                          updateLine(item.id, { priceWithVat: value })
                        }
                        disabled={isPending}
                      />
                    </td>
                    {showCashPrice ? (
                      <td className="px-3 py-2">
                        <PriceInput
                          ariaLabel={`${item.name}: цена нал`}
                          value={state.priceCash}
                          onChange={(value) =>
                            updateLine(item.id, { priceCash: value })
                          }
                          disabled={isPending}
                        />
                      </td>
                    ) : null}
                    <td className="px-3 py-2">
                      <PriceInput
                        ariaLabel={`${item.name}: цена без НДС`}
                        value={state.priceWithoutVat}
                        onChange={(value) =>
                          updateLine(item.id, { priceWithoutVat: value })
                        }
                        disabled={isPending}
                      />
                    </td>
                    {needsDelivery ? (
                      <>
                        <td className="px-3 py-2">
                          <PriceInput
                            ariaLabel={`${item.name}: доставка`}
                            value={state.deliveryPrice}
                            onChange={(value) =>
                              updateLine(item.id, {
                                deliveryPrice: value,
                                priceIncludesDelivery: false,
                              })
                            }
                            disabled={isPending || deliveryDisabled}
                          />
                        </td>
                        <td className="px-3 py-2 text-center">
                          <input
                            type="checkbox"
                            aria-label={`${item.name}: цена с доставкой`}
                            className={CHECKBOX_CLASS}
                            checked={state.priceIncludesDelivery}
                            disabled={isPending || state.deliveryPrice.trim().length > 0}
                            onChange={(event) =>
                              updateLine(item.id, {
                                priceIncludesDelivery: event.target.checked,
                                deliveryPrice: event.target.checked
                                  ? ""
                                  : state.deliveryPrice,
                              })
                            }
                          />
                        </td>
                      </>
                    ) : null}
                    <td className="px-3 py-2 text-center">
                      <input
                        type="checkbox"
                        aria-label={`${item.name}: в наличии`}
                        className={CHECKBOX_CLASS}
                        checked={state.inStock}
                        disabled={isPending || stockDisabled}
                        onChange={(event) =>
                          updateLine(item.id, {
                            inStock: event.target.checked,
                            leadTimeDays: event.target.checked
                              ? ""
                              : state.leadTimeDays,
                          })
                        }
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        type="number"
                        min={1}
                        step={1}
                        inputMode="numeric"
                        aria-label={`${item.name}: срок поставки в днях`}
                        value={state.leadTimeDays}
                        disabled={isPending || leadDisabled}
                        onChange={(event) =>
                          updateLine(item.id, {
                            leadTimeDays: event.target.value,
                            inStock: false,
                          })
                        }
                        className="w-20 text-right tabular-nums"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        type="text"
                        aria-label={`${item.name}: комментарий к строке`}
                        value={state.lineComment}
                        disabled={isPending}
                        onChange={(event) =>
                          updateLine(item.id, {
                            lineComment: event.target.value,
                          })
                        }
                        className="min-w-[8rem]"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="space-y-2">
          <Label htmlFor="response-comment">Комментарий к ответу</Label>
          <Textarea
            id="response-comment"
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            disabled={isPending}
            placeholder="Общий комментарий к этой версии ответа (необязательно)"
            rows={3}
          />
        </div>

        {error ? (
          <div
            role="alert"
            className="rounded-lg border border-danger-border bg-danger-bg p-4 text-sm text-danger"
          >
            {error}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" onClick={handleSubmit} disabled={isPending}>
            {isPending ? "Отправка…" : submitLabel}
          </Button>
          <Link
            href="/supplier"
            className="text-sm text-text-secondary underline underline-offset-4"
          >
            Отмена
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

function PriceInput({
  ariaLabel,
  value,
  onChange,
  disabled,
}: {
  ariaLabel: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <Input
      type="text"
      inputMode="decimal"
      aria-label={ariaLabel}
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
      className="w-24 text-right tabular-nums"
    />
  );
}

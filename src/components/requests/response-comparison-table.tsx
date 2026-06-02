"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

import { VersionHistory } from "@/components/responses/version-history";
import { Badge } from "@/components/ui/badge";
import type { PaymentForm } from "@/lib/parser/bitrix";
import {
  comparableUnitPrice,
  findBestSupplierIndex,
  type LinePrices,
} from "@/lib/price-compare";
import {
  describeDeadline,
  requestSupplierStatusPresentation,
} from "@/lib/request-status";
import type {
  ResponseVersionLine,
  ResponseVersionWithLines,
} from "@/lib/response-versions.types";
import { cn } from "@/lib/utils";

/** Request line shown in the comparison table rows. */
export interface ComparisonRequestItem {
  id: string;
  name: string;
  quantity: number | null;
  unit: string | null;
}

/** One invited supplier column (invite + version history). */
export interface ComparisonSupplier {
  inviteId: string;
  supplierName: string;
  status: string;
  deadlineAt: string | null;
  versions: ResponseVersionWithLines[];
}

export interface ResponseComparisonTableProps {
  items: ComparisonRequestItem[];
  suppliers: ComparisonSupplier[];
  cashToNoncashRatio: number;
  paymentForm: PaymentForm | null;
  needsDelivery: boolean;
  /** Passed from the server page for stable deadline badges. */
  nowIso: string;
}

const EMPTY = "—";

function formatPrice(value: number | null): string {
  if (value == null) return EMPTY;
  return value.toLocaleString("ru-RU", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

function formatStockLead(
  inStock: boolean | null,
  leadTimeDays: number | null,
): string {
  if (inStock === true) return "В наличии";
  if (leadTimeDays != null) return `${leadTimeDays} дн.`;
  return EMPTY;
}

function formatDelivery(
  deliveryPrice: number | null,
  priceIncludesDelivery: boolean,
): string {
  if (priceIncludesDelivery) return "Включена в цену";
  if (deliveryPrice != null) return formatPrice(deliveryPrice);
  return EMPTY;
}

function getCurrentVersion(
  versions: ResponseVersionWithLines[],
): ResponseVersionWithLines | null {
  return versions.find((v) => v.isCurrent) ?? null;
}

function getLineForItem(
  version: ResponseVersionWithLines | null,
  itemId: string,
): ResponseVersionLine | null {
  if (!version) return null;
  return version.lines.find((line) => line.requestItemId === itemId) ?? null;
}

function lineToPrices(line: ResponseVersionLine | null): LinePrices {
  if (!line) return {};
  return {
    price_with_vat: line.priceWithVat,
    price_cash: line.priceCash,
    price_without_vat: line.priceWithoutVat,
  };
}

function hasLineContent(line: ResponseVersionLine | null): boolean {
  if (!line) return false;
  return (
    line.priceWithVat != null ||
    line.priceCash != null ||
    line.priceWithoutVat != null ||
    line.inStock != null ||
    line.leadTimeDays != null ||
    line.deliveryPrice != null ||
    line.priceIncludesDelivery ||
    Boolean(line.lineComment?.trim())
  );
}

function PriceVariants({
  line,
  showCashPrice,
}: {
  line: ResponseVersionLine | null;
  showCashPrice: boolean;
}) {
  if (!line) return <span className="text-text-muted">{EMPTY}</span>;

  const rows: { label: string; value: number | null }[] = [
    { label: "с НДС", value: line.priceWithVat },
    ...(showCashPrice ? [{ label: "нал", value: line.priceCash }] : []),
    { label: "без НДС", value: line.priceWithoutVat },
  ].filter((row) => row.value != null);

  if (rows.length === 0) {
    return <span className="text-text-muted">{EMPTY}</span>;
  }

  return (
    <ul className="flex flex-col gap-0.5">
      {rows.map((row) => (
        <li
          key={row.label}
          className="flex justify-between gap-2 text-xs tabular-nums"
        >
          <span className="text-text-secondary">{row.label}</span>
          <span className="font-medium text-text-primary">
            {formatPrice(row.value)}
          </span>
        </li>
      ))}
    </ul>
  );
}

function ComparisonCell({
  line,
  isBest,
  showCashPrice,
  needsDelivery,
}: {
  line: ResponseVersionLine | null;
  isBest: boolean;
  showCashPrice: boolean;
  needsDelivery: boolean;
}) {
  if (!hasLineContent(line)) {
    return <span className="text-sm text-text-muted">{EMPTY}</span>;
  }

  return (
    <div className="flex flex-col gap-2 text-sm">
      {isBest ? (
        <Badge variant="success" className="w-fit">
          Лучшая цена
        </Badge>
      ) : null}
      <PriceVariants line={line} showCashPrice={showCashPrice} />
      <div className="text-xs text-text-secondary">
        <span className="text-text-muted">Наличие: </span>
        {formatStockLead(line?.inStock ?? null, line?.leadTimeDays ?? null)}
      </div>
      {needsDelivery ? (
        <div className="text-xs text-text-secondary">
          <span className="text-text-muted">Доставка: </span>
          {formatDelivery(
            line?.deliveryPrice ?? null,
            line?.priceIncludesDelivery ?? false,
          )}
        </div>
      ) : null}
      {line?.lineComment?.trim() ? (
        <p className="text-xs text-text-secondary">
          <span className="text-text-muted">Коммент.: </span>
          {line.lineComment.trim()}
        </p>
      ) : null}
    </div>
  );
}

function SupplierHistoryPanel({
  versions,
  paymentForm,
  needsDelivery,
}: {
  versions: ResponseVersionWithLines[];
  paymentForm: PaymentForm | null;
  needsDelivery: boolean;
}) {
  const [open, setOpen] = useState(false);

  if (versions.length === 0) return null;

  return (
    <div className="mt-2 border-t border-table-border pt-2">
      <button
        type="button"
        className="flex w-full items-center gap-1 text-left text-xs font-medium text-accent-primary hover:underline"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <ChevronDown
          className={cn(
            "size-3.5 shrink-0 transition-transform",
            open && "rotate-180",
          )}
          aria-hidden
        />
        История ответов ({versions.length})
      </button>
      {open ? (
        <div className="mt-2 max-h-80 overflow-y-auto">
          <VersionHistory
            versions={versions}
            paymentForm={paymentForm}
            needsDelivery={needsDelivery}
            compact
          />
        </div>
      ) : null}
    </div>
  );
}

/**
 * Procurement comparison grid: request items × invited suppliers (RSP-008).
 * Highlights the best comparable unit price per row; column headers show invite
 * status and deadline (RSP-009).
 */
export function ResponseComparisonTable({
  items,
  suppliers,
  cashToNoncashRatio,
  paymentForm,
  needsDelivery,
  nowIso,
}: ResponseComparisonTableProps) {
  const now = new Date(nowIso);
  const showCashPrice = paymentForm !== "non_cash";

  const bestIndexByItemId = new Map<string, number | null>();
  for (const item of items) {
    const comparablePrices = suppliers.map((supplier) => {
      const current = getCurrentVersion(supplier.versions);
      const line = getLineForItem(current, item.id);
      return comparableUnitPrice(lineToPrices(line), cashToNoncashRatio);
    });
    bestIndexByItemId.set(
      item.id,
      findBestSupplierIndex(comparablePrices),
    );
  }

  if (suppliers.length === 0) {
    return (
      <p className="text-sm text-text-secondary">
        Поставщики ещё не приглашены — сравнение появится после приглашения.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-table-border">
      <table className="w-full min-w-[40rem] border-collapse text-sm">
        <thead className="bg-table-header-bg text-text-secondary">
          <tr>
            <th className="sticky left-0 z-10 min-w-[12rem] bg-table-header-bg px-3 py-2 text-left font-medium">
              Позиция
            </th>
            {suppliers.map((supplier) => {
              const status = requestSupplierStatusPresentation(supplier.status);
              const deadline = describeDeadline(supplier.deadlineAt, now);
              return (
                <th
                  key={supplier.inviteId}
                  className="min-w-[11rem] px-3 py-2 text-left align-top font-medium"
                >
                  <div className="flex flex-col gap-2">
                    <span className="font-semibold text-text-primary">
                      {supplier.supplierName}
                    </span>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge variant={status.variant}>{status.label}</Badge>
                      {deadline ? (
                        <Badge variant={deadline.variant}>
                          {deadline.label}
                        </Badge>
                      ) : null}
                    </div>
                    <SupplierHistoryPanel
                      versions={supplier.versions}
                      paymentForm={paymentForm}
                      needsDelivery={needsDelivery}
                    />
                  </div>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {items.length === 0 ? (
            <tr className="border-t border-table-border bg-table-bg">
              <td
                colSpan={suppliers.length + 1}
                className="px-3 py-4 text-text-secondary"
              >
                В запросе пока нет позиций.
              </td>
            </tr>
          ) : (
            items.map((item) => {
              const bestIndex = bestIndexByItemId.get(item.id) ?? null;
              return (
                <tr
                  key={item.id}
                  className="border-t border-table-border bg-table-bg"
                >
                  <td className="sticky left-0 z-10 bg-table-bg px-3 py-3 align-top">
                    <div className="font-medium text-text-primary">
                      {item.name}
                    </div>
                    <div className="mt-0.5 text-xs text-text-secondary tabular-nums">
                      {item.quantity ?? EMPTY}
                      {item.unit ? ` ${item.unit}` : ""}
                    </div>
                  </td>
                  {suppliers.map((supplier, columnIndex) => {
                    const current = getCurrentVersion(supplier.versions);
                    const line = getLineForItem(current, item.id);
                    const isBest =
                      bestIndex !== null && bestIndex === columnIndex;
                    return (
                      <td
                        key={supplier.inviteId}
                        className={cn(
                          "px-3 py-3 align-top",
                          isBest && "bg-highlight-soft",
                        )}
                      >
                        <ComparisonCell
                          line={line}
                          isBest={isBest}
                          showCashPrice={showCashPrice}
                          needsDelivery={needsDelivery}
                        />
                      </td>
                    );
                  })}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}

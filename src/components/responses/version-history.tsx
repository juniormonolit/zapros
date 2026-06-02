"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type { PaymentForm } from "@/lib/parser/bitrix";
import type { ResponseVersionWithLines } from "@/lib/response-versions.types";
import { cn } from "@/lib/utils";

export type { ResponseVersionWithLines } from "@/lib/response-versions.types";

export interface VersionHistoryProps {
  versions: ResponseVersionWithLines[];
  paymentForm?: PaymentForm | null;
  needsDelivery?: boolean;
  /** Tighter layout for embedding in comparison cells (RSP-008). */
  compact?: boolean;
  className?: string;
}

const EMPTY = "—";

function formatSubmittedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

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

/**
 * Collapsible version history for supplier/procurement views (RSP-007).
 * Each version expands to a line-item table; the current version shows an «Актуальная» badge.
 */
export function VersionHistory({
  versions,
  paymentForm = null,
  needsDelivery = false,
  compact = false,
  className,
}: VersionHistoryProps) {
  const [expandedId, setExpandedId] = useState<string | null>(() =>
    versions.find((v) => v.isCurrent)?.id ?? versions[0]?.id ?? null,
  );

  if (versions.length === 0) {
    return (
      <p className="text-sm text-text-secondary">История ответов пока пуста.</p>
    );
  }

  const showCashPrice = paymentForm !== "non_cash";

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <ul
        className={cn(
          "flex flex-col divide-y divide-border-primary rounded-lg border border-border-primary",
          compact && "text-xs",
        )}
      >
        {versions.map((version) => {
          const isExpanded = expandedId === version.id;
          return (
            <li key={version.id}>
              <button
                type="button"
                className={cn(
                  "flex w-full flex-wrap items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-bg-secondary",
                  compact && "px-2 py-1.5",
                )}
                aria-expanded={isExpanded}
                onClick={() =>
                  setExpandedId((current) =>
                    current === version.id ? null : version.id,
                  )
                }
              >
                <ChevronDown
                  className={cn(
                    "size-4 shrink-0 text-text-secondary transition-transform",
                    isExpanded && "rotate-180",
                  )}
                  aria-hidden
                />
                <span className="font-mono font-medium text-text-primary">
                  v{version.versionNumber}
                </span>
                <span className="text-text-secondary">
                  {formatSubmittedAt(version.submittedAt)}
                </span>
                {version.isCurrent ? (
                  <Badge variant="success">Актуальная</Badge>
                ) : null}
                {version.lines.length > 0 ? (
                  <span className="text-text-muted">
                    {version.lines.length}{" "}
                    {version.lines.length === 1 ? "строка" : "строк"}
                  </span>
                ) : null}
              </button>

              {isExpanded ? (
                <div
                  className={cn(
                    "border-t border-border-primary bg-bg-secondary/50 px-3 pb-3 pt-2",
                    compact && "px-2 pb-2",
                  )}
                >
                  {version.comment?.trim() ? (
                    <p className="mb-2 text-sm text-text-secondary">
                      <span className="font-medium text-text-primary">
                        Комментарий:{" "}
                      </span>
                      {version.comment.trim()}
                    </p>
                  ) : null}

                  {version.lines.length === 0 ? (
                    <p className="text-sm text-text-muted">
                      В этой версии нет строк ответа.
                    </p>
                  ) : (
                    <div className="overflow-x-auto rounded-md border border-table-border">
                      <table className="w-full min-w-[32rem] border-collapse text-sm">
                        <thead className="bg-table-header-bg text-text-secondary">
                          <tr>
                            <th className="px-2 py-1.5 text-left font-medium">
                              Товар
                            </th>
                            <th className="px-2 py-1.5 text-right font-medium">
                              С НДС
                            </th>
                            {showCashPrice ? (
                              <th className="px-2 py-1.5 text-right font-medium">
                                Нал
                              </th>
                            ) : null}
                            <th className="px-2 py-1.5 text-right font-medium">
                              Без НДС
                            </th>
                            {needsDelivery ? (
                              <th className="px-2 py-1.5 text-right font-medium">
                                Доставка
                              </th>
                            ) : null}
                            <th className="px-2 py-1.5 text-left font-medium">
                              Наличие / срок
                            </th>
                            <th className="px-2 py-1.5 text-left font-medium">
                              Комментарий
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {version.lines.map((line) => (
                            <tr
                              key={line.id}
                              className="border-t border-table-border bg-table-bg"
                            >
                              <td className="px-2 py-1.5 font-medium text-text-primary">
                                {line.itemName}
                              </td>
                              <td className="px-2 py-1.5 text-right tabular-nums">
                                {formatPrice(line.priceWithVat)}
                              </td>
                              {showCashPrice ? (
                                <td className="px-2 py-1.5 text-right tabular-nums">
                                  {formatPrice(line.priceCash)}
                                </td>
                              ) : null}
                              <td className="px-2 py-1.5 text-right tabular-nums">
                                {formatPrice(line.priceWithoutVat)}
                              </td>
                              {needsDelivery ? (
                                <td className="px-2 py-1.5 text-right tabular-nums">
                                  {formatDelivery(
                                    line.deliveryPrice,
                                    line.priceIncludesDelivery,
                                  )}
                                </td>
                              ) : null}
                              <td className="px-2 py-1.5 text-text-primary">
                                {formatStockLead(
                                  line.inStock,
                                  line.leadTimeDays,
                                )}
                              </td>
                              <td className="px-2 py-1.5 text-text-secondary">
                                {line.lineComment?.trim() || EMPTY}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

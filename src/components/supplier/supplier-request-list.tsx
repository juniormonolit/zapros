"use client";

import Link from "next/link";
import { Search } from "lucide-react";
import { useId, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  requestSupplierStatusPresentation,
  type StatusPresentation,
} from "@/lib/request-status";

/**
 * Row shape for the supplier invite list. Deadline badge is computed on the
 * server and passed pre-rendered; invite status is mapped to a badge on the
 * client via {@link requestSupplierStatusPresentation}.
 */
export interface SupplierRequestListItem {
  /** `request_suppliers.id` — used in `/supplier/requests/[inviteId]`. */
  inviteId: string;
  requestCode: string;
  taskNumber: number | null;
  taskTitle: string | null;
  inviteStatus: string;
  /** ISO send timestamp for the invite (or parent request). */
  sentAt: string | null;
  deadline: StatusPresentation | null;
}

function formatSentAt(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function taskLabel(item: SupplierRequestListItem): string {
  return item.taskTitle?.trim() || "Без названия";
}

function matchesQuery(item: SupplierRequestListItem, query: string): boolean {
  const haystacks = [
    item.requestCode,
    item.taskNumber !== null ? String(item.taskNumber) : "",
    item.taskTitle ?? "",
  ];
  return haystacks.some((value) => value.toLowerCase().includes(query));
}

function InviteStatusBadge({ status }: { status: string }) {
  const { label, variant } = requestSupplierStatusPresentation(status);
  return <Badge variant={variant}>{label}</Badge>;
}

function EmptyState() {
  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle>Пока нет входящих запросов</CardTitle>
        <CardDescription>
          Когда снабженец отправит вам запрос, он появится в этом списке.
        </CardDescription>
      </CardHeader>
    </Card>
  );
}

function NoResults() {
  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle>Ничего не найдено</CardTitle>
        <CardDescription>
          Запросов по вашему поиску нет. Измените текст в поле поиска.
        </CardDescription>
      </CardHeader>
    </Card>
  );
}

function InviteRow({ item }: { item: SupplierRequestListItem }) {
  return (
    <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:gap-4">
      <span className="font-mono text-sm text-text-secondary sm:w-32 sm:shrink-0">
        {item.requestCode}
      </span>

      <span className="min-w-0 flex-1 truncate text-text-primary">
        <span className="font-medium">{taskLabel(item)}</span>
        {item.taskNumber !== null ? (
          <span className="ml-2 font-mono text-xs text-text-secondary">
            №&nbsp;{item.taskNumber}
          </span>
        ) : null}
      </span>

      <span className="sm:w-40 sm:shrink-0">
        <InviteStatusBadge status={item.inviteStatus} />
      </span>

      <span className="text-sm text-text-secondary sm:w-28 sm:shrink-0 sm:text-right">
        {formatSentAt(item.sentAt)}
      </span>

      <span className="sm:w-44 sm:shrink-0 sm:text-right">
        {item.deadline ? (
          <Badge variant={item.deadline.variant}>{item.deadline.label}</Badge>
        ) : (
          <span className="text-sm text-text-muted">—</span>
        )}
      </span>

      <span className="sm:w-28 sm:shrink-0 sm:text-right">
        <Link
          href={`/supplier/requests/${item.inviteId}`}
          className={buttonVariants({ size: "sm" })}
        >
          Ответить
        </Link>
      </span>
    </div>
  );
}

function InviteTable({ items }: { items: SupplierRequestListItem[] }) {
  if (items.length === 0) return null;

  return (
    <Card className="overflow-hidden py-0">
      <ul className="divide-y divide-border-primary">
        {items.map((item) => (
          <li key={item.inviteId}>
            <InviteRow item={item} />
          </li>
        ))}
      </ul>
    </Card>
  );
}

/**
 * Supplier invite list with client-side search. Active invites are shown first;
 * completed ones (lost / won / no_response) appear in a separate section below.
 */
export function SupplierRequestList({
  activeItems,
  completedItems,
  hideSearch = false,
}: {
  activeItems: SupplierRequestListItem[];
  completedItems: SupplierRequestListItem[];
  hideSearch?: boolean;
}) {
  const searchId = useId();
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase();

  const filteredActive = useMemo(() => {
    if (hideSearch || normalizedQuery.length === 0) return activeItems;
    return activeItems.filter((item) => matchesQuery(item, normalizedQuery));
  }, [activeItems, normalizedQuery, hideSearch]);

  const filteredCompleted = useMemo(() => {
    if (hideSearch || normalizedQuery.length === 0) return completedItems;
    return completedItems.filter((item) => matchesQuery(item, normalizedQuery));
  }, [completedItems, normalizedQuery, hideSearch]);

  const totalCount = activeItems.length + completedItems.length;
  const filteredCount = filteredActive.length + filteredCompleted.length;

  if (totalCount === 0) {
    return <EmptyState />;
  }

  return (
    <div className="flex flex-col gap-6">
      {!hideSearch ? (
        <div className="space-y-2">
          <Label htmlFor={searchId} className="sr-only">
            Поиск по запросам
          </Label>
          <div className="relative max-w-md">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-secondary"
              aria-hidden="true"
            />
            <Input
              id={searchId}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Поиск по коду запроса, № или названию задачи"
              className="pl-9"
            />
          </div>
        </div>
      ) : null}

      {filteredCount === 0 ? (
        <NoResults />
      ) : (
        <>
          {filteredActive.length > 0 ? (
            <section className="flex flex-col gap-3">
              <h2 className="text-sm font-medium text-text-secondary">
                Активные
              </h2>
              <InviteTable items={filteredActive} />
            </section>
          ) : null}

          {filteredCompleted.length > 0 ? (
            <section className="flex flex-col gap-3">
              <h2 className="text-sm font-medium text-text-secondary">
                Завершённые
              </h2>
              <InviteTable items={filteredCompleted} />
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}

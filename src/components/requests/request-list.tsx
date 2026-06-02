"use client";

import Link from "next/link";
import { Search } from "lucide-react";
import { useId, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { RequestFilterableItem } from "@/lib/request-filter-types";
import {
  requestStatusPresentation,
  type StatusPresentation,
} from "@/lib/request-status";

/**
 * Row shape for the procurement request list. The deadline badge is computed on
 * the server and passed in pre-rendered.
 */
export interface RequestListItem extends RequestFilterableItem {
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

function taskLabel(item: RequestListItem): string {
  return item.taskTitle?.trim() || "Без названия";
}

function matchesQuery(item: RequestListItem, query: string): boolean {
  const haystacks = [
    item.requestCode,
    item.taskNumber !== null ? String(item.taskNumber) : "",
    item.taskTitle ?? "",
    item.category ?? "",
  ];
  return haystacks.some((value) => value.toLowerCase().includes(query));
}

function StatusBadge({ status }: { status: string }) {
  const { label, variant } = requestStatusPresentation(status);
  return <Badge variant={variant}>{label}</Badge>;
}

function EmptyState() {
  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle>Пока нет запросов</CardTitle>
        <CardDescription>
          Создайте запрос из карточки задачи: отметьте позиции и нажмите
          «Создать запрос».
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Link href="/app" className={buttonVariants({ variant: "outline" })}>
          К задачам
        </Link>
      </CardContent>
    </Card>
  );
}

function NoResults() {
  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle>Ничего не найдено</CardTitle>
        <CardDescription>
          Запросов по выбранным условиям нет. Измените фильтры или поиск.
        </CardDescription>
      </CardHeader>
    </Card>
  );
}

function RequestRow({ item }: { item: RequestListItem }) {
  return (
    <Link
      href={`/app/requests/${item.id}`}
      className="flex flex-col gap-2 px-4 py-3 transition-colors hover:bg-bg-card-hover focus-visible:bg-bg-card-hover focus-visible:outline-none sm:flex-row sm:items-center sm:gap-4"
    >
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
        <StatusBadge status={item.status} />
      </span>

      <span className="text-sm text-text-secondary sm:w-28 sm:shrink-0 sm:text-right">
        {item.supplierCount}&nbsp;{"пост."}
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
    </Link>
  );
}

/**
 * Procurement request list with client-side search. Status/category filters live
 * in {@link RequestFilters} on the parent view.
 */
export function RequestList({ items }: { items: RequestListItem[] }) {
  const searchId = useId();
  const [query, setQuery] = useState("");

  const normalizedQuery = query.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (normalizedQuery.length === 0) return items;
    return items.filter((item) => matchesQuery(item, normalizedQuery));
  }, [items, normalizedQuery]);

  if (items.length === 0) {
    return <EmptyState />;
  }

  return (
    <div className="flex flex-col gap-4">
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

      {filtered.length === 0 ? (
        <NoResults />
      ) : (
        <Card className="overflow-hidden py-0">
          <ul className="divide-y divide-border-primary">
            {filtered.map((item) => (
              <li key={item.id}>
                <RequestRow item={item} />
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

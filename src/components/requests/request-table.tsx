"use client";

import Link from "next/link";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { RequestListItem } from "@/components/requests/request-list";
import { requestStatusPresentation } from "@/lib/request-status";
import { cn } from "@/lib/utils";

type SortKey =
  | "requestCode"
  | "task"
  | "status"
  | "suppliers"
  | "sentAt"
  | "deadline";

type SortDir = "asc" | "desc";

interface RequestTableProps {
  items: RequestListItem[];
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

function compareStrings(a: string, b: string, dir: SortDir): number {
  const cmp = a.localeCompare(b, "ru", { numeric: true });
  return dir === "asc" ? cmp : -cmp;
}

function compareNullableDate(
  a: string | null,
  b: string | null,
  dir: SortDir,
): number {
  const ta = a ? new Date(a).getTime() : 0;
  const tb = b ? new Date(b).getTime() : 0;
  const cmp = ta - tb;
  return dir === "asc" ? cmp : -cmp;
}

function SortHeader({
  label,
  active,
  dir,
  onClick,
  className,
}: {
  label: string;
  active: boolean;
  dir: SortDir;
  onClick: () => void;
  className?: string;
}) {
  const Icon = active ? (dir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <button
      type="button"
      className={cn(
        "inline-flex items-center gap-1 text-left text-xs font-medium text-text-secondary hover:text-text-primary",
        className,
      )}
      onClick={onClick}
    >
      {label}
      <Icon className="size-3.5 shrink-0" aria-hidden />
    </button>
  );
}

export function RequestTable({ items }: RequestTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("sentAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "requestCode" ? "asc" : "desc");
    }
  };

  const sorted = useMemo(() => {
    const copy = [...items];
    copy.sort((a, b) => {
      switch (sortKey) {
        case "requestCode":
          return compareStrings(a.requestCode, b.requestCode, sortDir);
        case "task": {
          const la = `${a.taskNumber ?? ""} ${taskLabel(a)}`;
          const lb = `${b.taskNumber ?? ""} ${taskLabel(b)}`;
          return compareStrings(la, lb, sortDir);
        }
        case "status":
          return compareStrings(a.status, b.status, sortDir);
        case "suppliers":
          return sortDir === "asc"
            ? a.supplierCount - b.supplierCount
            : b.supplierCount - a.supplierCount;
        case "sentAt":
          return compareNullableDate(a.sentAt, b.sentAt, sortDir);
        case "deadline": {
          const da = a.deadline?.label ?? "";
          const db = b.deadline?.label ?? "";
          return compareStrings(da, db, sortDir);
        }
        default:
          return 0;
      }
    });
    return copy;
  }, [items, sortKey, sortDir]);

  if (items.length === 0) {
    return (
      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Пока нет запросов</CardTitle>
          <CardDescription>
            Запросы появятся после отправки из карточки задачи.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border-primary">
      <table className="w-full min-w-[720px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-border-primary bg-bg-muted/40">
            <th className="px-3 py-2 text-left">
              <SortHeader
                label="Код"
                active={sortKey === "requestCode"}
                dir={sortDir}
                onClick={() => toggleSort("requestCode")}
              />
            </th>
            <th className="px-3 py-2 text-left">
              <SortHeader
                label="Задача"
                active={sortKey === "task"}
                dir={sortDir}
                onClick={() => toggleSort("task")}
              />
            </th>
            <th className="px-3 py-2 text-left">
              <SortHeader
                label="Статус"
                active={sortKey === "status"}
                dir={sortDir}
                onClick={() => toggleSort("status")}
              />
            </th>
            <th className="px-3 py-2 text-right">
              <SortHeader
                label="Пост."
                active={sortKey === "suppliers"}
                dir={sortDir}
                onClick={() => toggleSort("suppliers")}
                className="justify-end"
              />
            </th>
            <th className="px-3 py-2 text-right">
              <SortHeader
                label="Отправлен"
                active={sortKey === "sentAt"}
                dir={sortDir}
                onClick={() => toggleSort("sentAt")}
                className="justify-end"
              />
            </th>
            <th className="px-3 py-2 text-right">
              <SortHeader
                label="Дедлайн"
                active={sortKey === "deadline"}
                dir={sortDir}
                onClick={() => toggleSort("deadline")}
                className="justify-end"
              />
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((item) => {
            const { label, variant } = requestStatusPresentation(item.status);
            return (
              <tr
                key={item.id}
                className="border-b border-border-primary transition-colors last:border-0 hover:bg-bg-card-hover"
              >
                <td className="px-3 py-2">
                  <Link
                    href={`/app/requests/${item.id}`}
                    className="font-mono text-text-secondary hover:text-text-primary"
                  >
                    {item.requestCode}
                  </Link>
                </td>
                <td className="max-w-[240px] truncate px-3 py-2 text-text-primary">
                  <Link href={`/app/requests/${item.id}`} className="hover:underline">
                    {taskLabel(item)}
                    {item.taskNumber !== null ? (
                      <span className="ml-1 font-mono text-xs text-text-secondary">
                        №&nbsp;{item.taskNumber}
                      </span>
                    ) : null}
                  </Link>
                </td>
                <td className="px-3 py-2">
                  <Badge variant={variant}>{label}</Badge>
                </td>
                <td className="px-3 py-2 text-right text-text-secondary">
                  {item.supplierCount}
                </td>
                <td className="px-3 py-2 text-right text-text-secondary">
                  {formatSentAt(item.sentAt)}
                </td>
                <td className="px-3 py-2 text-right">
                  {item.deadline ? (
                    <Badge variant={item.deadline.variant}>
                      {item.deadline.label}
                    </Badge>
                  ) : (
                    <span className="text-text-muted">—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

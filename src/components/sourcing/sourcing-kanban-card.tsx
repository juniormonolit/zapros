"use client";

import { MoreHorizontal } from "lucide-react";
import { useState } from "react";

import { KanbanCard } from "@/components/kanban/kanban-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  allowedSourcingDropTargets,
  SOURCING_KANBAN_COLUMNS,
} from "@/lib/sourcing-kanban-config";
import {
  SOURCING_STATUS_LABELS,
  type SourcingStatus,
} from "@/lib/sourcing";
import { cn } from "@/lib/utils";

export interface SourcingKanbanCardItem {
  id: string;
  name: string;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  sourcing_status: string;
  works_in_zapros?: boolean;
}

interface SourcingKanbanCardProps {
  item: SourcingKanbanCardItem;
  isDragging?: boolean;
  dragHandleProps?: React.ComponentPropsWithoutRef<"button">;
  onMoveTo?: (targetStatus: SourcingStatus) => void;
}

function sourcingStatusPresentation(status: string) {
  const column = SOURCING_KANBAN_COLUMNS.find((col) => col.id === status);
  const label =
    status in SOURCING_STATUS_LABELS
      ? SOURCING_STATUS_LABELS[status as SourcingStatus]
      : status;
  return {
    label,
    variant: column?.variant ?? ("muted" as const),
  };
}

function contactLines(item: SourcingKanbanCardItem): string[] {
  const lines: string[] = [];
  const person = item.contact_person?.trim();
  const phone = item.phone?.trim();
  const email = item.email?.trim();
  if (person) lines.push(person);
  if (phone) lines.push(phone);
  if (email) lines.push(email);
  return lines;
}

export function SourcingKanbanCard({
  item,
  isDragging,
  dragHandleProps,
  onMoveTo,
}: SourcingKanbanCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const targets = allowedSourcingDropTargets(item.sourcing_status);
  const { label, variant } = sourcingStatusPresentation(item.sourcing_status);
  const contacts = contactLines(item);

  return (
    <KanbanCard isDragging={isDragging} className="relative flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-text-primary">
            {item.name.trim() || "Без названия"}
          </p>
          {contacts.length > 0 ? (
            <ul className="mt-1 space-y-0.5 text-xs text-text-secondary">
              {contacts.map((line) => (
                <li key={line} className="truncate">
                  {line}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-xs text-text-muted">Контакты не указаны</p>
          )}
        </div>

        {onMoveTo && targets.length > 0 ? (
          <div className="relative shrink-0">
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label="Переместить в…"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((open) => !open)}
            >
              <MoreHorizontal className="size-4" />
            </Button>
            {menuOpen ? (
              <>
                <button
                  type="button"
                  className="fixed inset-0 z-10"
                  aria-label="Закрыть меню"
                  onClick={() => setMenuOpen(false)}
                />
                <ul
                  className="absolute top-full right-0 z-20 mt-1 min-w-[11rem] rounded-lg border border-border-primary bg-bg-card py-1 shadow-lg"
                  role="menu"
                >
                  {targets.map((status) => (
                    <li key={status} role="none">
                      <button
                        type="button"
                        role="menuitem"
                        className="w-full px-3 py-1.5 text-left text-sm hover:bg-bg-card-hover"
                        onClick={() => {
                          setMenuOpen(false);
                          onMoveTo(status);
                        }}
                      >
                        {sourcingStatusPresentation(status).label}
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={variant}>{label}</Badge>
        {item.works_in_zapros ? (
          <Badge variant="success">В Zapros</Badge>
        ) : null}
      </div>

      {dragHandleProps ? (
        <button
          type="button"
          className={cn(
            "mt-1 w-full cursor-grab rounded border border-dashed border-border-primary py-1 text-center text-xs text-text-muted active:cursor-grabbing",
          )}
          {...dragHandleProps}
        >
          Перетащить
        </button>
      ) : null}
    </KanbanCard>
  );
}

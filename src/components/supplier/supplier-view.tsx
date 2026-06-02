"use client";

import { Filter, LayoutGrid, List, Search } from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";

import { FilterDrawer } from "@/components/filters/filter-drawer";
import { SupplierKanban } from "@/components/supplier/supplier-kanban";
import {
  SupplierRequestList,
  type SupplierRequestListItem,
} from "@/components/supplier/supplier-request-list";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const VIEW_STORAGE_KEY = "zapros-supplier-view";
const HIDDEN_INVITE_STATUSES = new Set(["lost", "no_response", "won"]);

type SupplierViewMode = "list" | "kanban";

function loadViewMode(): SupplierViewMode {
  if (typeof window === "undefined") return "kanban";
  return window.localStorage.getItem(VIEW_STORAGE_KEY) === "list"
    ? "list"
    : "kanban";
}

function matchesQuery(item: SupplierRequestListItem, query: string): boolean {
  const haystacks = [
    item.requestCode,
    item.taskNumber !== null ? String(item.taskNumber) : "",
    item.taskTitle ?? "",
  ];
  return haystacks.some((value) => value.toLowerCase().includes(query));
}

interface SupplierViewProps {
  items: SupplierRequestListItem[];
}

export function SupplierView({ items }: SupplierViewProps) {
  const searchId = useId();
  const [viewMode, setViewMode] = useState<SupplierViewMode>(() => loadViewMode());
  const [query, setQuery] = useState("");
  const [showCompleted, setShowCompleted] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  const normalizedQuery = query.trim().toLowerCase();

  const filtered = useMemo(() => {
    return items.filter((item) => {
      if (
        !showCompleted &&
        HIDDEN_INVITE_STATUSES.has(item.inviteStatus)
      ) {
        return false;
      }
      if (normalizedQuery.length > 0 && !matchesQuery(item, normalizedQuery)) {
        return false;
      }
      return true;
    });
  }, [items, showCompleted, normalizedQuery]);

  const { activeItems, completedItems } = useMemo(() => {
    const active: SupplierRequestListItem[] = [];
    const completed: SupplierRequestListItem[] = [];
    for (const item of filtered) {
      if (HIDDEN_INVITE_STATUSES.has(item.inviteStatus)) {
        completed.push(item);
      } else {
        active.push(item);
      }
    }
    return { activeItems: active, completedItems: completed };
  }, [filtered]);

  const setMode = (mode: SupplierViewMode) => {
    setViewMode(mode);
    window.localStorage.setItem(VIEW_STORAGE_KEY, mode);
  };

  const filterControls = (
    <div className="flex flex-col gap-4">
      <div className="space-y-2">
        <Label htmlFor={searchId}>Поиск</Label>
        <div className="relative">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-secondary"
            aria-hidden
          />
          <Input
            id={searchId}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Код, № Bitrix, название"
            className="pl-9"
          />
        </div>
      </div>
      <label className="flex cursor-pointer items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="size-4 rounded border-border-primary"
          checked={showCompleted}
          onChange={(e) => setShowCompleted(e.target.checked)}
        />
        Показать завершённые
      </label>
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div
          className="inline-flex rounded-lg border border-border-primary p-0.5"
          role="group"
          aria-label="Режим отображения"
        >
          <Button
            type="button"
            size="sm"
            variant={viewMode === "list" ? "secondary" : "ghost"}
            onClick={() => setMode("list")}
          >
            <List className="size-4" />
            Список
          </Button>
          <Button
            type="button"
            size="sm"
            variant={viewMode === "kanban" ? "secondary" : "ghost"}
            onClick={() => setMode("kanban")}
          >
            <LayoutGrid className="size-4" />
            Канбан
          </Button>
        </div>
      </div>

      {isMobile ? (
        <>
          <Button
            type="button"
            variant="outline"
            onClick={() => setDrawerOpen(true)}
          >
            <Filter className="size-4" />
            Фильтры
          </Button>
          <FilterDrawer
            open={drawerOpen}
            onOpenChange={setDrawerOpen}
            title="Фильтры"
          >
            {filterControls}
          </FilterDrawer>
        </>
      ) : (
        <div className="rounded-xl border border-border-primary bg-bg-card p-4">
          {filterControls}
        </div>
      )}

      {viewMode === "list" ? (
        <SupplierRequestList
          activeItems={activeItems}
          completedItems={completedItems}
          hideSearch
        />
      ) : (
        <SupplierKanban items={filtered} showCompleted={showCompleted} />
      )}
    </div>
  );
}

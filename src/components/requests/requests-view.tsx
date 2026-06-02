"use client";

import { LayoutGrid, List } from "lucide-react";
import { useMemo, useState } from "react";

import {
  RequestFilters,
  applyPresetInWork,
  defaultRequestFilters,
} from "@/components/filters/request-filters";
import { RequestKanban } from "@/components/requests/request-kanban";
import { RequestList, type RequestListItem } from "@/components/requests/request-list";
import { Button } from "@/components/ui/button";
import { filterRequestByState } from "@/lib/kanban-config";
import type {
  RequestFilterOptions,
  RequestFilterState,
} from "@/lib/request-filter-types";

const VIEW_STORAGE_KEY = "zapros-requests-view";

type RequestsViewMode = "list" | "kanban";

function loadViewMode(): RequestsViewMode {
  if (typeof window === "undefined") return "kanban";
  const stored = window.localStorage.getItem(VIEW_STORAGE_KEY);
  return stored === "list" ? "list" : "kanban";
}

interface RequestsViewProps {
  items: RequestListItem[];
  filterOptions: RequestFilterOptions;
}

export function RequestsView({ items, filterOptions }: RequestsViewProps) {
  const [viewMode, setViewMode] = useState<RequestsViewMode>(() => loadViewMode());
  const [draft, setDraft] = useState<RequestFilterState>(defaultRequestFilters);
  const [applied, setApplied] = useState<RequestFilterState>(defaultRequestFilters);
  const [showCompleted, setShowCompleted] = useState(false);

  const filtered = useMemo(
    () =>
      items.filter((item) => filterRequestByState(item, applied, showCompleted)),
    [items, applied, showCompleted],
  );

  const setMode = (mode: RequestsViewMode) => {
    setViewMode(mode);
    window.localStorage.setItem(VIEW_STORAGE_KEY, mode);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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

      <RequestFilters
        draft={draft}
        onDraftChange={setDraft}
        applied={applied}
        onApply={() => setApplied({ ...draft })}
        onReset={() => {
          const reset = applyPresetInWork();
          setDraft(reset);
          setApplied(reset);
          setShowCompleted(false);
        }}
        showCompleted={showCompleted}
        onShowCompletedChange={setShowCompleted}
        options={filterOptions}
      />

      {viewMode === "list" ? (
        <RequestList items={filtered} />
      ) : (
        <RequestKanban items={filtered} showCompleted={showCompleted} />
      )}
    </div>
  );
}

"use client";

import { useMemo, useState } from "react";

import {
  RequestFilters,
  applyPresetInWork,
  defaultRequestFilters,
} from "@/components/filters/request-filters";
import { RequestTable } from "@/components/requests/request-table";
import type { RequestListItem } from "@/components/requests/request-list";
import { filterRequestByState } from "@/lib/kanban-config";
import type {
  RequestFilterOptions,
  RequestFilterState,
} from "@/lib/request-filter-types";

interface RequestsTableViewProps {
  items: RequestListItem[];
  filterOptions: RequestFilterOptions;
}

export function RequestsTableView({
  items,
  filterOptions,
}: RequestsTableViewProps) {
  const [draft, setDraft] = useState<RequestFilterState>(defaultRequestFilters);
  const [applied, setApplied] = useState<RequestFilterState>(defaultRequestFilters);
  const [showCompleted, setShowCompleted] = useState(false);

  const filtered = useMemo(
    () =>
      items.filter((item) => filterRequestByState(item, applied, showCompleted)),
    [items, applied, showCompleted],
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-end gap-3">
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
      </div>
      <RequestTable items={filtered} />
    </div>
  );
}

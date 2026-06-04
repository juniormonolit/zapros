"use client";

import { Filter } from "lucide-react";
import { useId, useState } from "react";

import { FilterDrawer } from "@/components/filters/filter-drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  REQUEST_STATUS_FILTER_OPTIONS,
  applyPresetInWork,
  defaultRequestFilters,
} from "@/lib/kanban-config";
import type {
  RequestFilterOptions,
  RequestFilterState,
} from "@/lib/request-filter-types";
import type { RequestStatus } from "@/lib/request-status";

export { applyPresetInWork, defaultRequestFilters };

interface RequestFiltersProps {
  draft: RequestFilterState;
  onDraftChange: (next: RequestFilterState) => void;
  applied: RequestFilterState;
  onApply: () => void;
  onReset: () => void;
  showCompleted: boolean;
  onShowCompletedChange: (value: boolean) => void;
  options: RequestFilterOptions;
}

function FilterFields({
  draft,
  onDraftChange,
  options,
  showCompleted,
  onShowCompletedChange,
  statusId,
  presetId,
}: {
  draft: RequestFilterState;
  onDraftChange: (next: RequestFilterState) => void;
  options: RequestFilterOptions;
  showCompleted: boolean;
  onShowCompletedChange: (value: boolean) => void;
  statusId: string;
  presetId: string;
}) {
  const toggleStatus = (status: RequestStatus) => {
    const has = draft.statuses.includes(status);
    const statuses = has
      ? draft.statuses.filter((s) => s !== status)
      : [...draft.statuses, status];
    onDraftChange({ ...draft, preset: "custom", statuses });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="space-y-2">
        <Label htmlFor={presetId}>Группа стадий</Label>
        <Select
          id={presetId}
          value={draft.preset}
          onChange={(event) => {
            const preset = event.target.value as RequestFilterState["preset"];
            if (preset === "in_work") {
              onDraftChange(applyPresetInWork());
            } else {
              onDraftChange({ ...draft, preset: "custom" });
            }
          }}
        >
          <option value="in_work">Запрос в работе</option>
          <option value="custom">Свой набор</option>
        </Select>
      </div>

      <fieldset className="space-y-2">
        <legend id={statusId} className="text-sm font-medium text-text-primary">
          Статус запроса
        </legend>
        <div
          className="flex max-h-40 flex-col gap-2 overflow-y-auto rounded-lg border border-border-primary p-3"
          aria-labelledby={statusId}
        >
          {REQUEST_STATUS_FILTER_OPTIONS.map((option) => (
            <label
              key={option.value}
              className="flex cursor-pointer items-center gap-2 text-sm text-text-primary"
            >
              <input
                type="checkbox"
                className="size-4 rounded border-border-primary"
                checked={draft.statuses.includes(option.value)}
                onChange={() => toggleStatus(option.value)}
              />
              {option.label}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="created-from">Дата создания с</Label>
          <Input
            id="created-from"
            type="date"
            value={draft.createdFrom}
            onChange={(e) =>
              onDraftChange({ ...draft, createdFrom: e.target.value, preset: "custom" })
            }
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="created-to">по</Label>
          <Input
            id="created-to"
            type="date"
            value={draft.createdTo}
            onChange={(e) =>
              onDraftChange({ ...draft, createdTo: e.target.value, preset: "custom" })
            }
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="filter-category">Категория</Label>
        <Input
          id="filter-category"
          list="filter-category-options"
          value={draft.category}
          onChange={(e) =>
            onDraftChange({ ...draft, category: e.target.value, preset: "custom" })
          }
          placeholder="Например, мск_Утеплитель"
        />
        <datalist id="filter-category-options">
          {options.categories.map((cat) => (
            <option key={cat} value={cat} />
          ))}
        </datalist>
      </div>

      <div className="space-y-2">
        <Label htmlFor="filter-bitrix">Номер Bitrix</Label>
        <Input
          id="filter-bitrix"
          value={draft.bitrixNumber}
          onChange={(e) =>
            onDraftChange({ ...draft, bitrixNumber: e.target.value, preset: "custom" })
          }
          placeholder="113153"
          inputMode="numeric"
        />
      </div>

      {options.suppliers.length > 0 ? (
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-text-primary">
            Поставщик
          </legend>
          <div className="flex max-h-32 flex-col gap-2 overflow-y-auto rounded-lg border border-border-primary p-3">
            {options.suppliers.map((supplier) => (
              <label
                key={supplier.id}
                className="flex cursor-pointer items-center gap-2 text-sm"
              >
                <input
                  type="checkbox"
                  className="size-4 rounded border-border-primary"
                  checked={draft.supplierIds.includes(supplier.id)}
                  onChange={() => {
                    const has = draft.supplierIds.includes(supplier.id);
                    const supplierIds = has
                      ? draft.supplierIds.filter((id) => id !== supplier.id)
                      : [...draft.supplierIds, supplier.id];
                    onDraftChange({ ...draft, supplierIds, preset: "custom" });
                  }}
                />
                {supplier.label}
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}

      <label className="flex cursor-pointer items-center gap-2 text-sm text-text-primary">
        <input
          type="checkbox"
          className="size-4 rounded border-border-primary"
          checked={showCompleted}
          onChange={(e) => onShowCompletedChange(e.target.checked)}
        />
        Показать завершённые
      </label>
    </div>
  );
}

function FilterActions({
  onApply,
  onReset,
}: {
  onApply: () => void;
  onReset: () => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <Button type="button" variant="outline" onClick={onReset}>
        Сбросить
      </Button>
      <Button type="button" onClick={onApply}>
        Применить
      </Button>
    </div>
  );
}

function FiltersPanel(props: RequestFiltersProps & { statusId: string; presetId: string }) {
  return (
    <div className="flex flex-col gap-4">
      <FilterFields {...props} statusId={props.statusId} presetId={props.presetId} />
      <FilterActions onApply={props.onApply} onReset={props.onReset} />
    </div>
  );
}

/**
 * Shared request filters: opens in a right-side drawer (F005 / kanban-and-filters-ux).
 * Keeps the main area for list/kanban; avoids a full-width filter panel on desktop.
 */
export function RequestFilters(props: RequestFiltersProps) {
  const statusId = useId();
  const presetId = useId();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const handleApply = () => {
    props.onApply();
    setDrawerOpen(false);
  };

  const handleReset = () => {
    props.onReset();
    setDrawerOpen(false);
  };

  const panel = (
    <FiltersPanel
      {...props}
      onApply={handleApply}
      onReset={handleReset}
      statusId={statusId}
      presetId={presetId}
    />
  );

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setDrawerOpen(true)}
      >
        <Filter className="size-4" />
        Фильтры
      </Button>
      <FilterDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        title="Фильтры запросов"
        className="max-w-md"
      >
        {panel}
      </FilterDrawer>
    </>
  );
}

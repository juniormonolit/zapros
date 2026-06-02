"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import {
  addSupplierToRequest,
  type AddSupplierToRequestResult,
} from "@/actions/requests";
import {
  SupplierPicker,
  type PickerGroup,
  type PickerSupplier,
} from "@/components/requests/supplier-picker";
import { Button } from "@/components/ui/button";

export interface AddSupplierControlProps {
  requestId: string;
  /** Every supplier available for selection (in-system + manual). */
  suppliers: PickerSupplier[];
  groups: PickerGroup[];
  ungroupedSupplierIds: string[];
  /** Supplier ids that already have an invite — hidden from the picker. */
  invitedSupplierIds: string[];
}

/**
 * Drop suppliers that are already invited out of the picker data so the user
 * can only pick genuinely new recipients. Groups left empty afterwards are
 * removed, matching how {@link loadAvailableSuppliers} omits empty groups.
 */
function excludeInvited(
  suppliers: PickerSupplier[],
  groups: PickerGroup[],
  ungroupedSupplierIds: string[],
  invitedSupplierIds: string[],
): {
  suppliers: PickerSupplier[];
  groups: PickerGroup[];
  ungroupedSupplierIds: string[];
} {
  const invited = new Set(invitedSupplierIds);
  const isOpen = (id: string) => !invited.has(id);

  const nextSuppliers = suppliers.filter((supplier) => isOpen(supplier.id));
  const nextGroups = groups
    .map((group) => ({
      ...group,
      supplierIds: group.supplierIds.filter(isOpen),
    }))
    .filter((group) => group.supplierIds.length > 0);
  const nextUngrouped = ungroupedSupplierIds.filter(isOpen);

  return {
    suppliers: nextSuppliers,
    groups: nextGroups,
    ungroupedSupplierIds: nextUngrouped,
  };
}

/** Build the post-submit notice from the action's success breakdown. */
function buildNotice(
  result: Extract<AddSupplierToRequestResult, { ok: true }>,
): string {
  const parts = [`Добавлено поставщиков: ${result.addedSupplierIds.length}.`];
  if (result.alreadyInvitedSupplierIds.length > 0) {
    parts.push(`Уже были приглашены: ${result.alreadyInvitedSupplierIds.length}.`);
  }
  if (result.skippedSupplierIds.length > 0) {
    parts.push(`Вне системы (свяжитесь вручную): ${result.skippedSupplierIds.length}.`);
  }
  return parts.join(" ");
}

/**
 * Inline control on the request card for adding suppliers after a request has
 * been sent (REQ-009). Clicking «Добавить поставщика» reveals a {@link
 * SupplierPicker} limited to suppliers that are not already invited; submitting
 * calls {@link addSupplierToRequest}, which creates fresh invites (each with its
 * own `sent_at`/`deadline_at`). On success the page is refreshed so the new
 * invites appear in the list.
 */
export function AddSupplierControl({
  requestId,
  suppliers,
  groups,
  ungroupedSupplierIds,
  invitedSupplierIds,
}: AddSupplierControlProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [open, setOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [manualIds, setManualIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const available = useMemo(
    () => excludeInvited(suppliers, groups, ungroupedSupplierIds, invitedSupplierIds),
    [suppliers, groups, ungroupedSupplierIds, invitedSupplierIds],
  );

  const hasOpenSuppliers = available.suppliers.length > 0;
  const hasSelection = selectedIds.length > 0;

  function reset() {
    setSelectedIds([]);
    setManualIds([]);
    setError(null);
  }

  function handleToggleOpen() {
    setNotice(null);
    if (open) {
      reset();
      setOpen(false);
    } else {
      setOpen(true);
    }
  }

  function handleSubmit() {
    if (!hasSelection || isPending) return;
    setError(null);
    setNotice(null);

    const ids = selectedIds;
    startTransition(async () => {
      const result = await addSupplierToRequest(requestId, ids);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      reset();
      setOpen(false);
      setNotice(buildNotice(result));
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleToggleOpen}
        disabled={isPending}
      >
        {open ? "Отмена" : "Добавить поставщика"}
      </Button>

      {notice && !open ? (
        <p className="text-sm text-text-secondary" role="status">
          {notice}
        </p>
      ) : null}

      {open ? (
        <div className="w-full space-y-4 rounded-lg border border-border-primary bg-bg-secondary/40 p-4">
          {hasOpenSuppliers ? (
            <SupplierPicker
              suppliers={available.suppliers}
              groups={available.groups}
              ungroupedSupplierIds={available.ungroupedSupplierIds}
              value={selectedIds}
              onChange={setSelectedIds}
              manualValue={manualIds}
              onManualChange={setManualIds}
            />
          ) : (
            <p className="text-sm text-text-secondary">
              Нет новых поставщиков для добавления — все доступные уже приглашены.
            </p>
          )}

          {error ? (
            <div
              role="alert"
              className="rounded-lg border border-danger-border bg-danger-bg p-4 text-sm text-danger"
            >
              {error}
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={!hasSelection || isPending}
            >
              {isPending ? "Добавление…" : "Добавить к запросу"}
            </Button>
            {!hasSelection && hasOpenSuppliers ? (
              <span className="text-sm text-text-secondary">
                Выберите хотя бы одного поставщика внутри системы.
              </span>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

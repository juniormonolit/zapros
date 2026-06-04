"use client";

import {
  type DragEndEvent,
  type DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { useCallback, useState, useTransition } from "react";

import { updateSupplierSourcingStatus } from "@/actions/sourcing";
import type { UpdateSupplierSourcingStatusResult } from "@/actions/sourcing-types";
import {
  allowedSourcingDropTargets,
  sourcingStatusForColumn,
} from "@/lib/sourcing-kanban-config";
import type { SourcingStatus } from "@/lib/sourcing";

interface UseSourcingKanbanDndOptions {
  onNeedsProvision: (supplierId: string) => void;
}

function applyStatusResult(
  result: UpdateSupplierSourcingStatusResult,
  supplierId: string,
  setError: (message: string | null) => void,
  onNeedsProvision: (id: string) => void,
) {
  if (result.ok) {
    setError(null);
    return;
  }
  if ("needsProvision" in result && result.needsProvision) {
    setError(null);
    onNeedsProvision(supplierId);
    return;
  }
  if ("error" in result) {
    setError(result.error);
  }
}

export function useSourcingKanbanDnd({
  onNeedsProvision,
}: UseSourcingKanbanDndOptions) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor),
  );

  const onDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(String(event.active.id));
    setError(null);
  }, []);

  const onDragEnd = useCallback(
    (event: DragEndEvent, currentStatusById: Map<string, string>) => {
      setActiveId(null);
      const { active, over } = event;
      if (!over) return;

      const supplierId = String(active.id);
      const targetStatus =
        sourcingStatusForColumn(String(over.id)) ??
        (String(over.id) as SourcingStatus);
      const fromStatus = currentStatusById.get(supplierId);
      if (!fromStatus || fromStatus === targetStatus) return;

      if (!allowedSourcingDropTargets(fromStatus).includes(targetStatus)) {
        setError("Такой переход не разрешён.");
        return;
      }

      startTransition(async () => {
        const result = await updateSupplierSourcingStatus(
          supplierId,
          targetStatus,
        );
        applyStatusResult(result, supplierId, setError, onNeedsProvision);
      });
    },
    [onNeedsProvision],
  );

  const moveToStatus = useCallback(
    (
      supplierId: string,
      fromStatus: string,
      targetStatus: SourcingStatus,
    ) => {
      if (!allowedSourcingDropTargets(fromStatus).includes(targetStatus)) {
        setError("Такой переход не разрешён.");
        return;
      }
      setError(null);
      startTransition(async () => {
        const result = await updateSupplierSourcingStatus(
          supplierId,
          targetStatus,
        );
        applyStatusResult(result, supplierId, setError, onNeedsProvision);
      });
    },
    [onNeedsProvision],
  );

  return {
    sensors,
    activeId,
    error,
    isPending,
    onDragStart,
    onDragEnd,
    moveToStatus,
    clearError: () => setError(null),
  };
}

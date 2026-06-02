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

import { updateRequestStatus } from "@/actions/requests";
import {
  allowedRequestDropTargets,
  requestStatusForColumn,
} from "@/lib/kanban-config";
import type { RequestStatus } from "@/lib/request-status";

export function useRequestKanbanDnd() {
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

      const requestId = String(active.id);
      const targetStatus =
        requestStatusForColumn(String(over.id)) ??
        (String(over.id) as RequestStatus);
      const fromStatus = currentStatusById.get(requestId);
      if (!fromStatus || fromStatus === targetStatus) return;

      if (!allowedRequestDropTargets(fromStatus).includes(targetStatus)) {
        setError("Такой переход не разрешён.");
        return;
      }

      startTransition(async () => {
        const result = await updateRequestStatus(requestId, targetStatus);
        if (!result.ok) {
          setError(result.error);
        }
      });
    },
    [],
  );

  const moveToStatus = useCallback(
    (requestId: string, fromStatus: string, targetStatus: RequestStatus) => {
      if (!allowedRequestDropTargets(fromStatus).includes(targetStatus)) {
        setError("Такой переход не разрешён.");
        return;
      }
      setError(null);
      startTransition(async () => {
        const result = await updateRequestStatus(requestId, targetStatus);
        if (!result.ok) setError(result.error);
      });
    },
    [],
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

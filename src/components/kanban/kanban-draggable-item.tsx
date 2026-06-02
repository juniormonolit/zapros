"use client";

import { useDraggable } from "@dnd-kit/core";
import type { ReactNode } from "react";

interface KanbanDraggableItemProps {
  id: string;
  disabled?: boolean;
  children: (props: {
    setActivatorNodeRef: (element: HTMLElement | null) => void;
    listeners: ReturnType<typeof useDraggable>["listeners"];
    attributes: ReturnType<typeof useDraggable>["attributes"];
    isDragging: boolean;
  }) => ReactNode;
}

export function KanbanDraggableItem({
  id,
  disabled,
  children,
}: KanbanDraggableItemProps) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, isDragging } =
    useDraggable({ id, disabled });

  return (
    <div ref={setNodeRef} className={isDragging ? "opacity-40" : undefined}>
      {children({
        setActivatorNodeRef,
        listeners,
        attributes,
        isDragging,
      })}
    </div>
  );
}

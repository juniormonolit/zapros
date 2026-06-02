"use client";

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

interface KanbanCardProps {
  children: ReactNode;
  className?: string;
  isDragging?: boolean;
}

export function KanbanCard({ children, className, isDragging }: KanbanCardProps) {
  return (
    <div
      className={cn(
        "rounded-lg border border-border-primary bg-bg-card p-3 shadow-sm transition-shadow",
        isDragging && "opacity-60 shadow-md ring-2 ring-ring/30",
        className,
      )}
    >
      {children}
    </div>
  );
}

"use client";

import { X } from "lucide-react";
import { useEffect, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface FilterDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: ReactNode;
  className?: string;
}

/** Right-side drawer for filters on narrow viewports. */
export function FilterDrawer({
  open,
  onOpenChange,
  title,
  children,
  className,
}: FilterDrawerProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onOpenChange(false);
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onOpenChange]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        aria-label="Закрыть фильтры"
        onClick={() => onOpenChange(false)}
      />
      <aside
        className={cn(
          "relative flex h-full w-full max-w-sm flex-col border-l border-border-primary bg-bg-card shadow-lg",
          className,
        )}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="flex items-center justify-between gap-2 border-b border-border-primary px-4 py-3">
          <h2 className="text-base font-semibold text-text-primary">{title}</h2>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => onOpenChange(false)}
            aria-label="Закрыть"
          >
            <X className="size-4" />
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">{children}</div>
      </aside>
    </div>
  );
}

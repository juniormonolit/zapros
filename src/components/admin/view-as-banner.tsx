"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

import { clearViewAsUserId } from "@/actions/view-as";
import { Button } from "@/components/ui/button";

interface ViewAsBannerProps {
  displayName: string;
  roleLabel: string;
}

/**
 * Shown under the topbar when an admin impersonates another user (VIEWAS-007).
 */
export function ViewAsBanner({ displayName, roleLabel }: ViewAsBannerProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleClear() {
    startTransition(async () => {
      const result = await clearViewAsUserId();
      if (!result.ok) return;
      router.refresh();
    });
  }

  return (
    <div
      className="flex flex-wrap items-center justify-between gap-3 border-b border-info-border bg-info-bg px-4 py-2 text-sm text-info sm:px-6"
      role="status"
    >
      <p>
        Просмотр от лица:{" "}
        <span className="font-medium">
          {displayName} ({roleLabel})
        </span>
      </p>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={isPending}
        onClick={handleClear}
      >
        Сбросить
      </Button>
    </div>
  );
}

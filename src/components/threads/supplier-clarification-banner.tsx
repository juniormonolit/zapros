import { PauseCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { formatEventTime } from "@/lib/request-events-display";

export interface SupplierClarificationBannerProps {
  inviteStatus: string;
  timerPausedAt: string | null;
}

/**
 * Informational banner for suppliers when clarification is active.
 */
export function SupplierClarificationBanner({
  inviteStatus,
  timerPausedAt,
}: SupplierClarificationBannerProps) {
  if (inviteStatus !== "clarification") return null;

  return (
    <div
      className="flex flex-col gap-2 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3"
      role="status"
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="warning" className="gap-1">
          <PauseCircle className="size-3.5" aria-hidden />
          Запрос на уточнении
        </Badge>
        {timerPausedAt ? (
          <span className="text-xs text-text-secondary">
            Таймер приостановлен с {formatEventTime(timerPausedAt)}
          </span>
        ) : null}
      </div>
      <p className="text-sm text-text-secondary">
        Снабжение запросило уточнение. Обновите ответ или напишите в переписке
        ниже.
      </p>
    </div>
  );
}

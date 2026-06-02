"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2, PauseCircle } from "lucide-react";

import {
  requestClarification,
  resumeFromClarification,
} from "@/actions/events";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatEventTime } from "@/lib/request-events-display";

export interface ClarificationControlsProps {
  requestSupplierId: string;
  inviteStatus: string;
  timerPausedAt: string | null;
  disabled?: boolean;
  disabledReason?: string | null;
}

/**
 * Procurement controls to start or end clarification (timer pause).
 */
export function ClarificationControls({
  requestSupplierId,
  inviteStatus,
  timerPausedAt,
  disabled = false,
  disabledReason = null,
}: ClarificationControlsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [changeSummary, setChangeSummary] = useState("");
  const [error, setError] = useState<string | null>(null);

  const inClarification = inviteStatus === "clarification";
  const timerPaused = Boolean(timerPausedAt);

  function handleRequestClarification() {
    setError(null);
    startTransition(async () => {
      const result = await requestClarification(
        requestSupplierId,
        changeSummary || null,
      );
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setChangeSummary("");
      router.refresh();
    });
  }

  function handleResume() {
    setError(null);
    startTransition(async () => {
      const result = await resumeFromClarification(requestSupplierId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {timerPaused ? (
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="warning" className="gap-1">
            <PauseCircle className="size-3.5" aria-hidden />
            Таймер на паузе
          </Badge>
          {timerPausedAt ? (
            <span className="text-xs text-text-secondary">
              с {formatEventTime(timerPausedAt)}
            </span>
          ) : null}
        </div>
      ) : null}

      {inClarification ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-text-secondary">
            Ожидается уточнение от поставщика. Снимите уточнение, если правки не
            требуются.
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-fit"
            disabled={disabled || isPending}
            onClick={handleResume}
          >
            {isPending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : null}
            Снять уточнение
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <Label
            htmlFor={`clarification-summary-${requestSupplierId}`}
            className="text-xs"
          >
            Что уточнить (необязательно)
          </Label>
          <Textarea
            id={`clarification-summary-${requestSupplierId}`}
            value={changeSummary}
            onChange={(event) => setChangeSummary(event.target.value)}
            rows={2}
            disabled={disabled || isPending}
            maxLength={4000}
            placeholder="Опишите, что нужно изменить в ответе…"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-fit"
            disabled={disabled || isPending}
            onClick={handleRequestClarification}
          >
            {isPending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : null}
            Запросить уточнение
          </Button>
        </div>
      )}

      {disabled && disabledReason ? (
        <p className="text-xs text-text-secondary">{disabledReason}</p>
      ) : null}
      {error ? (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

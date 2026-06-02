"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";

import { postQuickSignal } from "@/actions/events";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { QuickSignalType } from "@/lib/request-events-types";
import {
  REQUEST_EVENT_SIGNAL_CHEAPER,
  REQUEST_EVENT_SIGNAL_CUSTOMER_PRICE,
  REQUEST_EVENT_SIGNAL_IN_PROGRESS,
} from "@/lib/request-events-types";

const SIGNAL_BUTTONS: {
  type: QuickSignalType;
  label: string;
}[] = [
  { type: REQUEST_EVENT_SIGNAL_CHEAPER, label: "Есть дешевле" },
  {
    type: REQUEST_EVENT_SIGNAL_CUSTOMER_PRICE,
    label: "У заказчика дешевле",
  },
  { type: REQUEST_EVENT_SIGNAL_IN_PROGRESS, label: "В работе" },
];

export interface QuickSignalsProps {
  requestSupplierId: string;
  disabled?: boolean;
  disabledReason?: string | null;
}

/**
 * Procurement quick-signal buttons for an invite thread (F006).
 */
export function QuickSignals({
  requestSupplierId,
  disabled = false,
  disabledReason = null,
}: QuickSignalsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendingType, setPendingType] = useState<QuickSignalType | null>(null);

  function sendSignal(signalType: QuickSignalType) {
    setError(null);
    setPendingType(signalType);

    startTransition(async () => {
      const result = await postQuickSignal(
        requestSupplierId,
        signalType,
        comment || null,
      );
      setPendingType(null);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setComment("");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-medium text-text-secondary">Быстрые сигналы</p>
      <div className="flex flex-wrap gap-2">
        {SIGNAL_BUTTONS.map((button) => {
          const loading = isPending && pendingType === button.type;
          return (
            <Button
              key={button.type}
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled || isPending}
              onClick={() => sendSignal(button.type)}
            >
              {loading ? (
                <Loader2 className="size-3.5 animate-spin" aria-hidden />
              ) : null}
              {button.label}
            </Button>
          );
        })}
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor={`signal-comment-${requestSupplierId}`} className="text-xs">
          Комментарий к сигналу (необязательно)
        </Label>
        <Textarea
          id={`signal-comment-${requestSupplierId}`}
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          rows={2}
          disabled={disabled || isPending}
          maxLength={4000}
          placeholder="Пояснение для поставщика…"
        />
      </div>
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

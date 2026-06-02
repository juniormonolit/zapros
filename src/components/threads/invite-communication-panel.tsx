"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

import { ClarificationControls } from "@/components/threads/clarification-controls";
import { QuickSignals } from "@/components/threads/quick-signals";
import { RequestThread } from "@/components/threads/request-thread";
import { Badge } from "@/components/ui/badge";
import { THREAD_ACTIVE_INVITE_STATUSES } from "@/lib/request-events-helpers";
import type { ThreadEvent } from "@/lib/request-events-display";
import { requestSupplierStatusPresentation } from "@/lib/request-status";
import { cn } from "@/lib/utils";

const FINAL_INVITE_STATUSES = new Set(["lost", "won", "no_response"]);
const BLOCKED_REQUEST_STATUSES = new Set(["draft", "cancelled"]);

export interface InviteCommunicationPanelProps {
  supplierName: string;
  requestSupplierId: string;
  inviteStatus: string;
  timerPausedAt: string | null;
  requestStatus: string;
  events: ThreadEvent[];
}

function threadDisabledReason(
  requestStatus: string,
  inviteStatus: string,
): string | null {
  if (BLOCKED_REQUEST_STATUSES.has(requestStatus)) {
    return "Переписка недоступна для черновика или отменённого запроса.";
  }
  if (FINAL_INVITE_STATUSES.has(inviteStatus)) {
    return "Приглашение завершено — переписка только для чтения.";
  }
  if (!THREAD_ACTIVE_INVITE_STATUSES.has(inviteStatus)) {
    return "На этом приглашении переписка закрыта.";
  }
  return null;
}

/**
 * Collapsible per-invite panel: thread, quick signals, clarification (procurement).
 */
export function InviteCommunicationPanel({
  supplierName,
  requestSupplierId,
  inviteStatus,
  timerPausedAt,
  requestStatus,
  events,
}: InviteCommunicationPanelProps) {
  const [open, setOpen] = useState(false);
  const status = requestSupplierStatusPresentation(inviteStatus);
  const disabledReason = threadDisabledReason(requestStatus, inviteStatus);
  const threadReadOnly = disabledReason !== null;
  const controlsDisabled =
    threadReadOnly || BLOCKED_REQUEST_STATUSES.has(requestStatus);

  return (
    <div className="rounded-lg border border-border-primary">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <ChevronDown
            className={cn(
              "size-4 shrink-0 text-text-secondary transition-transform",
              open && "rotate-180",
            )}
            aria-hidden
          />
          <span className="font-medium text-text-primary">{supplierName}</span>
          <Badge variant={status.variant}>{status.label}</Badge>
          {timerPausedAt ? (
            <Badge variant="warning">Таймер на паузе</Badge>
          ) : null}
        </div>
        <span className="shrink-0 text-xs text-text-secondary">
          Переписка ({events.length})
        </span>
      </button>

      {open ? (
        <div className="flex flex-col gap-4 border-t border-border-primary px-4 pb-4 pt-3">
          <ClarificationControls
            requestSupplierId={requestSupplierId}
            inviteStatus={inviteStatus}
            timerPausedAt={timerPausedAt}
            disabled={controlsDisabled}
            disabledReason={disabledReason}
          />
          <QuickSignals
            requestSupplierId={requestSupplierId}
            disabled={controlsDisabled}
            disabledReason={disabledReason}
          />
          <RequestThread
            requestSupplierId={requestSupplierId}
            role="procurement"
            events={events}
            readOnly={threadReadOnly}
          />
        </div>
      ) : null}
    </div>
  );
}

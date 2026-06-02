"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Loader2, Send } from "lucide-react";

import { postRequestMessage } from "@/actions/events";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  formatEventTime,
  formatThreadEventSummary,
  getThreadEventPresentation,
  type ThreadEvent,
} from "@/lib/request-events-display";
import type { RequestEventType } from "@/lib/request-events-types";
import { cn } from "@/lib/utils";

const POLL_INTERVAL_MS = 30_000;

export interface RequestThreadProps {
  requestSupplierId: string;
  role: "procurement" | "supplier";
  events: ThreadEvent[];
  readOnly?: boolean;
  /** Refresh server data every 30s (MVP; no Realtime). */
  enablePolling?: boolean;
  className?: string;
}

function eventContainerClass(eventType: RequestEventType): string {
  const kind = getThreadEventPresentation(eventType).kind;
  if (kind === "signal") {
    return "border-warning/40 bg-warning/10";
  }
  if (kind === "system") {
    return "border-border-primary bg-table-header-bg/80";
  }
  return "border-border-primary bg-bg-card";
}

/**
 * Per-invite communication thread: chronological feed + message form (F006).
 */
export function RequestThread({
  requestSupplierId,
  role,
  events,
  readOnly = false,
  enablePolling = true,
  className,
}: RequestThreadProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enablePolling || readOnly) return undefined;
    const timer = window.setInterval(() => {
      router.refresh();
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [enablePolling, readOnly, router]);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      const result = await postRequestMessage(requestSupplierId, message);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setMessage("");
      router.refresh();
    });
  }

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div
        className="flex max-h-72 flex-col gap-2 overflow-y-auto rounded-lg border border-border-primary p-2"
        aria-live="polite"
      >
        {events.length === 0 ? (
          <p className="px-2 py-4 text-center text-sm text-text-secondary">
            Сообщений пока нет.
          </p>
        ) : (
          events.map((item) => {
            const presentation = getThreadEventPresentation(item.eventType);
            const summary = formatThreadEventSummary(item);
            const isMessage = item.eventType === "message";

            return (
              <article
                key={item.id}
                className={cn(
                  "rounded-lg border px-3 py-2 text-sm",
                  eventContainerClass(item.eventType),
                )}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-text-primary">
                      {item.authorName}
                    </span>
                    {!isMessage ? (
                      <span className="text-xs font-medium text-text-secondary">
                        {presentation.label}
                      </span>
                    ) : null}
                  </div>
                  <time
                    className="text-xs text-text-muted tabular-nums"
                    dateTime={item.createdAt}
                  >
                    {formatEventTime(item.createdAt)}
                  </time>
                </div>
                {summary ? (
                  <p
                    className={cn(
                      "mt-1 whitespace-pre-wrap text-text-primary",
                      !isMessage && "text-text-secondary",
                    )}
                  >
                    {summary}
                  </p>
                ) : null}
              </article>
            );
          })
        )}
      </div>

      {!readOnly ? (
        <form onSubmit={handleSubmit} className="flex flex-col gap-2">
          <Textarea
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder={
              role === "procurement"
                ? "Сообщение поставщику…"
                : "Сообщение снабжению…"
            }
            rows={3}
            disabled={isPending}
            maxLength={4000}
            aria-label="Текст сообщения"
          />
          {error ? (
            <p className="text-sm text-danger" role="alert">
              {error}
            </p>
          ) : null}
          <div className="flex justify-end">
            <Button type="submit" size="sm" disabled={isPending || !message.trim()}>
              {isPending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <Send className="size-4" aria-hidden />
              )}
              Отправить
            </Button>
          </div>
        </form>
      ) : (
        <p className="text-xs text-text-secondary">
          Переписка закрыта для этого приглашения.
        </p>
      )}
    </div>
  );
}

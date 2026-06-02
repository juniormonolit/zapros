"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { rejectRequest, selectWinner } from "@/actions/requests";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  canFinalizeRequest,
  inviteHasResponse,
} from "@/lib/request-finalization";
import {
  MANUAL_REJECT_REASON_OPTIONS,
  type RejectReason,
} from "@/lib/request-finalization-types";

export interface FinalizationInviteOption {
  id: string;
  supplierName: string;
  status: string;
  firstResponseAt: string | null;
}

export interface RequestFinalizationControlsProps {
  requestId: string;
  requestStatus: string;
  invites: FinalizationInviteOption[];
}

/**
 * Win / reject actions on the procurement request card (F007 / WIN-005).
 * Irreversible in MVP — confirm before submit.
 */
export function RequestFinalizationControls({
  requestId,
  requestStatus,
  invites,
}: RequestFinalizationControlsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [mode, setMode] = useState<"none" | "winner" | "reject">("none");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [winnerInviteId, setWinnerInviteId] = useState("");
  const [winnerRejectReason, setWinnerRejectReason] =
    useState<RejectReason>("price");
  const [winnerComment, setWinnerComment] = useState("");

  const [rejectReason, setRejectReason] = useState<RejectReason>("price");
  const [rejectComment, setRejectComment] = useState("");

  if (!canFinalizeRequest(requestStatus)) {
    return null;
  }

  const respondingInvites = invites.filter((invite) =>
    inviteHasResponse({
      id: invite.id,
      supplierId: "",
      status: invite.status,
      firstResponseAt: invite.firstResponseAt,
    }),
  );

  const canSelectWinner = respondingInvites.length > 0;

  function closePanels() {
    setMode("none");
    setError(null);
  }

  function handleSelectWinner() {
    setError(null);
    setSuccess(null);
    if (!winnerInviteId) {
      setError("Выберите победителя.");
      return;
    }
    startTransition(async () => {
      const result = await selectWinner(
        requestId,
        winnerInviteId,
        winnerRejectReason,
        winnerComment || null,
      );
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSuccess("Победитель выбран. Запрос завершён.");
      closePanels();
      router.refresh();
    });
  }

  function handleReject() {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const result = await rejectRequest(
        requestId,
        rejectReason,
        rejectComment || null,
      );
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSuccess("Запрос закрыт браком.");
      closePanels();
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="default"
          size="sm"
          disabled={!canSelectWinner || isPending}
          onClick={() => {
            setMode("winner");
            setError(null);
            setSuccess(null);
            if (!winnerInviteId && respondingInvites[0]) {
              setWinnerInviteId(respondingInvites[0].id);
            }
          }}
        >
          Выбрать победителя
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isPending}
          onClick={() => {
            setMode("reject");
            setError(null);
            setSuccess(null);
          }}
        >
          Закрыть браком
        </Button>
      </div>

      {!canSelectWinner ? (
        <p className="text-xs text-text-secondary">
          Победителя можно выбрать после хотя бы одного ответа поставщика.
        </p>
      ) : null}

      {success ? (
        <p className="text-sm text-success" role="status">
          {success}
        </p>
      ) : null}

      {error ? (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}

      {mode === "winner" ? (
        <div className="flex flex-col gap-3 rounded-lg border border-border p-4">
          <p className="text-sm font-medium text-text-primary">
            Выбор победителя
          </p>
          <p className="text-xs text-text-secondary">
            Действие необратимо. Остальные поставщики получат выбранную причину
            отказа.
          </p>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="winner-invite">Победитель</Label>
            <Select
              id="winner-invite"
              value={winnerInviteId}
              onChange={(event) => setWinnerInviteId(event.target.value)}
              disabled={isPending}
            >
              <option value="">— выберите —</option>
              {respondingInvites.map((invite) => (
                <option key={invite.id} value={invite.id}>
                  {invite.supplierName}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="winner-reject-reason">
              Причина для остальных поставщиков
            </Label>
            <Select
              id="winner-reject-reason"
              value={winnerRejectReason}
              onChange={(event) =>
                setWinnerRejectReason(event.target.value as RejectReason)
              }
              disabled={isPending}
            >
              {MANUAL_REJECT_REASON_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </div>
          {winnerRejectReason === "other" ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="winner-comment">Комментарий</Label>
              <Textarea
                id="winner-comment"
                value={winnerComment}
                onChange={(event) => setWinnerComment(event.target.value)}
                disabled={isPending}
                rows={2}
              />
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              disabled={isPending}
              onClick={handleSelectWinner}
            >
              {isPending ? "Сохранение…" : "Подтвердить победу"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={isPending}
              onClick={closePanels}
            >
              Отмена
            </Button>
          </div>
        </div>
      ) : null}

      {mode === "reject" ? (
        <div className="flex flex-col gap-3 rounded-lg border border-border p-4">
          <p className="text-sm font-medium text-text-primary">
            Закрыть запрос браком
          </p>
          <p className="text-xs text-text-secondary">
            Победитель не выбирается. Все поставщики получат указанную причину.
          </p>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="reject-reason">Причина</Label>
            <Select
              id="reject-reason"
              value={rejectReason}
              onChange={(event) =>
                setRejectReason(event.target.value as RejectReason)
              }
              disabled={isPending}
            >
              {MANUAL_REJECT_REASON_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </div>
          {rejectReason === "other" ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="reject-comment">Комментарий</Label>
              <Textarea
                id="reject-comment"
                value={rejectComment}
                onChange={(event) => setRejectComment(event.target.value)}
                disabled={isPending}
                rows={2}
              />
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={isPending}
              onClick={handleReject}
            >
              {isPending ? "Сохранение…" : "Закрыть браком"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={isPending}
              onClick={closePanels}
            >
              Отмена
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

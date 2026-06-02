import type { RequestStatus } from "@/lib/request-status";
import type { RejectReason } from "@/lib/request-finalization-types";

/** Result of {@link updateRequestStatus} in `requests.ts` (no "use server"). */
export type UpdateRequestStatusResult =
  | { ok: true; requestId: string; status: RequestStatus }
  | { ok: false; error: string };

/** Result of {@link selectWinner} (F007 / WIN-002). */
export type SelectWinnerResult =
  | {
      ok: true;
      requestId: string;
      status: "won";
      winningRequestSupplierId: string;
      rejectReason: RejectReason;
    }
  | { ok: false; error: string };

/** Result of {@link rejectRequest} (F007 / WIN-003). */
export type RejectRequestResult =
  | { ok: true; requestId: string; status: "lost"; rejectReason: RejectReason }
  | { ok: false; error: string };

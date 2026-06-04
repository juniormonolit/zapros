import type { SourcingStatus } from "@/lib/sourcing";

/** useActionState form result for sourcing board create supplier. */
export interface SourcingActionState {
  error: string | null;
  ok: boolean;
}

export const initialSourcingState: SourcingActionState = {
  error: null,
  ok: false,
};

/** Result of {@link updateSupplierSourcingStatus} in `sourcing.ts`. */
export type UpdateSupplierSourcingStatusResult =
  | { ok: true }
  | { ok: false; needsProvision: true }
  | { ok: false; error: string };

/** Result of {@link provisionSupplierUser} in `sourcing.ts`. */
export type ProvisionSupplierUserResult =
  | { ok: true; userId: string }
  | { ok: false; error: string };

/** Result of {@link provisionAndMoveToWorkingInZapros} in `sourcing.ts`. */
export type ProvisionAndMoveResult =
  | { ok: true }
  | { ok: false; error: string };

export type { SourcingStatus };

"use client";

import { useActionState } from "react";

import { createSourcingSupplier } from "@/actions/sourcing";
import {
  initialSourcingState,
  type SourcingActionState,
} from "@/actions/sourcing-types";
import { FormError } from "@/components/admin/form-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: SourcingActionState = initialSourcingState;

/**
 * Compact form to add a supplier to the sourcing kanban (`new` column).
 */
export function CreateSupplierForm() {
  const [state, formAction, isPending] = useActionState(
    createSourcingSupplier,
    initialState,
  );

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <div className="flex min-w-[12rem] flex-1 flex-col gap-2 sm:max-w-xs">
          <Label htmlFor="sourcing-create-name">Название</Label>
          <Input
            id="sourcing-create-name"
            name="name"
            placeholder="Например, СтройТепло"
            required
            aria-invalid={state.error ? true : undefined}
          />
        </div>

        <div className="flex min-w-[10rem] flex-1 flex-col gap-2 sm:max-w-xs">
          <Label htmlFor="sourcing-create-contact">Контактное лицо</Label>
          <Input
            id="sourcing-create-contact"
            name="contact_person"
            placeholder="Иван Петров"
          />
        </div>

        <div className="flex min-w-[10rem] flex-1 flex-col gap-2 sm:max-w-xs">
          <Label htmlFor="sourcing-create-phone">Телефон</Label>
          <Input
            id="sourcing-create-phone"
            name="phone"
            type="tel"
            placeholder="+7 900 000-00-00"
          />
        </div>

        <div className="flex min-w-[12rem] flex-1 flex-col gap-2 sm:max-w-sm">
          <Label htmlFor="sourcing-create-email">Email</Label>
          <Input
            id="sourcing-create-email"
            name="email"
            type="email"
            placeholder="sales@example.com"
          />
        </div>

        <Button type="submit" disabled={isPending} className="sm:mb-0.5">
          {isPending ? "Добавление…" : "Добавить поставщика"}
        </Button>
      </div>

      {state.ok ? (
        <p
          role="status"
          className="rounded-lg border border-success-border bg-success-bg px-3 py-2 text-sm text-success"
        >
          Поставщик добавлен на доску.
        </p>
      ) : null}

      <FormError error={state.error} />
    </form>
  );
}

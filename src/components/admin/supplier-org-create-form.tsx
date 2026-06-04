"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";

import {
  initialSupplierOrgState,
} from "@/actions/supplier-org-types";
import { createSupplierOrg } from "@/actions/supplier-org";
import { FormError } from "@/components/admin/form-error";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  SUPPLIER_KINDS,
  SUPPLIER_KIND_LABELS,
  WAVE_PRIORITIES,
  WAVE_PRIORITY_LABELS,
} from "@/lib/supplier-org-labels";
import {
  DEFAULT_SOURCING_STATUS,
  SOURCING_STATUS_LABELS,
  SOURCING_STATUSES,
  type SourcingStatus,
} from "@/lib/sourcing";

export function SupplierOrgCreateForm() {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(
    createSupplierOrg,
    initialSupplierOrgState,
  );

  useEffect(() => {
    if (state.ok && state.supplierId) {
      router.push(`/admin/suppliers/${state.supplierId}`);
    }
  }, [state.ok, state.supplierId, router]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Новый поставщик</CardTitle>
        <CardDescription>
          Создайте карточку организации. Аккаунт можно добавить позже на вкладке
          «Контакты/аккаунты».
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="flex flex-col gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-2 sm:col-span-2">
              <Label htmlFor="new-supplier-name">Название</Label>
              <Input
                id="new-supplier-name"
                name="name"
                placeholder="Например, СтройТепло"
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="new-supplier-kind">Тип</Label>
              <Select id="new-supplier-kind" name="supplier_kind" defaultValue="">
                <option value="">—</option>
                {SUPPLIER_KINDS.map((kind) => (
                  <option key={kind} value={kind}>
                    {SUPPLIER_KIND_LABELS[kind]}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="new-supplier-priority">Приоритет</Label>
              <Select
                id="new-supplier-priority"
                name="wave_priority"
                defaultValue="normal"
              >
                {WAVE_PRIORITIES.map((priority) => (
                  <option key={priority} value={priority}>
                    {WAVE_PRIORITY_LABELS[priority]}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="new-supplier-contact">Контактное лицо</Label>
              <Input id="new-supplier-contact" name="contact_person" />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="new-supplier-phone">Телефон</Label>
              <Input id="new-supplier-phone" name="phone" type="tel" />
            </div>
            <div className="flex flex-col gap-2 sm:col-span-2">
              <Label htmlFor="new-supplier-status">Стадия проработки</Label>
              <Select
                id="new-supplier-status"
                name="sourcing_status"
                defaultValue={DEFAULT_SOURCING_STATUS}
              >
                {SOURCING_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {SOURCING_STATUS_LABELS[status as SourcingStatus]}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <div>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Создание…" : "Создать"}
            </Button>
          </div>
        </form>
        <FormError error={state.error} />
      </CardContent>
    </Card>
  );
}

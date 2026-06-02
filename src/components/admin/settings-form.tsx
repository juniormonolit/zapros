"use client";

import { useActionState } from "react";

import { initialCatalogState } from "@/actions/admin-catalog-types";
import { updateAppSettings } from "@/actions/admin-catalog";
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

import { FormError } from "./form-error";

interface SettingsFormProps {
  responseDeadlineDays: string;
  cashToNoncashRatio: string;
}

/**
 * Form for the global `app_settings` key-value pairs: the response deadline (in
 * calendar days before a request is archived) and the cash→non-cash comparison
 * coefficient. Both are validated server-side before being upserted.
 */
export function SettingsForm({
  responseDeadlineDays,
  cashToNoncashRatio,
}: SettingsFormProps) {
  const [state, formAction, isPending] = useActionState(
    updateAppSettings,
    initialCatalogState,
  );

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle>Глобальные параметры</CardTitle>
        <CardDescription>
          Параметры применяются ко всему приложению.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <Label htmlFor="response-deadline-days">
              Срок ответа (календарных дней)
            </Label>
            <Input
              id="response-deadline-days"
              name="response_deadline_days"
              type="number"
              min={1}
              step={1}
              defaultValue={responseDeadlineDays}
              required
            />
            <p className="text-xs text-text-secondary">
              По истечении срока запрос уходит в архив.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="cash-to-noncash-ratio">
              Коэффициент нал → безнал
            </Label>
            <Input
              id="cash-to-noncash-ratio"
              name="cash_to_noncash_ratio"
              type="number"
              min={0}
              max={1}
              step="0.01"
              defaultValue={cashToNoncashRatio}
              required
            />
            <p className="text-xs text-text-secondary">
              Число в диапазоне (0; 1] для сравнения цен.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Button type="submit" disabled={isPending}>
              {isPending ? "Сохранение…" : "Сохранить"}
            </Button>
            {state.ok ? (
              <span className="text-sm text-success">Сохранено.</span>
            ) : null}
          </div>
        </form>
        <FormError error={state.error} />
      </CardContent>
    </Card>
  );
}

"use client";

import { X } from "lucide-react";
import { useEffect, useState, useTransition, type FormEvent } from "react";

import { provisionAndMoveToWorkingInZapros } from "@/actions/sourcing";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const MIN_PASSWORD_LENGTH = 8;

const NEEDS_EMAIL_MESSAGE =
  "Укажите email на карточке поставщика перед переходом на стадию «Работает в Zapros».";

interface ProvisionSupplierModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  supplierId: string;
  supplierName: string;
  email: string;
}

/** Creates a supplier login and moves the card to «Работает в Zapros». */
export function ProvisionSupplierModal({
  open,
  onOpenChange,
  supplierId,
  supplierName,
  email: prefilledEmail,
}: ProvisionSupplierModalProps) {
  const [email, setEmail] = useState(prefilledEmail);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const emailMissing = !prefilledEmail.trim();

  useEffect(() => {
    if (!open) return;
    setEmail(prefilledEmail);
    setPassword("");
    setError(null);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onOpenChange(false);
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onOpenChange, prefilledEmail]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (emailMissing) return;
    setError(null);
    startTransition(async () => {
      const result = await provisionAndMoveToWorkingInZapros(
        supplierId,
        email,
        password,
      );
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onOpenChange(false);
    });
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        aria-label="Закрыть"
        onClick={() => onOpenChange(false)}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="provision-supplier-title"
        className={cn(
          "relative w-full max-w-md rounded-lg border border-border-primary bg-bg-card shadow-lg",
        )}
      >
        <div className="flex items-center justify-between gap-2 border-b border-border-primary px-4 py-3">
          <h2
            id="provision-supplier-title"
            className="text-base font-semibold text-text-primary"
          >
            Доступ в Zapros
          </h2>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => onOpenChange(false)}
            aria-label="Закрыть"
          >
            <X className="size-4" />
          </Button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-4">
          <p className="text-sm text-text-secondary">
            Создайте учётную запись для поставщика{" "}
            <span className="font-medium text-text-primary">{supplierName}</span>
            , чтобы перевести карточку на стадию «Работает в Zapros».
          </p>

          {emailMissing ? (
            <p
              role="alert"
              className="rounded-lg border border-danger-border bg-danger-bg px-3 py-2 text-sm text-danger"
            >
              {NEEDS_EMAIL_MESSAGE}
            </p>
          ) : (
            <>
              <div className="flex flex-col gap-2">
                <Label htmlFor="provision-email">Email</Label>
                <Input
                  id="provision-email"
                  name="email"
                  type="email"
                  autoComplete="off"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="provision-password">Пароль</Label>
                <Input
                  id="provision-password"
                  name="password"
                  type="text"
                  autoComplete="off"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder={`Минимум ${MIN_PASSWORD_LENGTH} символов`}
                  required
                  minLength={MIN_PASSWORD_LENGTH}
                />
                <p className="text-xs text-text-muted">
                  Поставщик сможет войти с этим паролем сразу после создания.
                </p>
              </div>
            </>
          )}

          {error ? (
            <p
              role="alert"
              className="rounded-lg border border-danger-border bg-danger-bg px-3 py-2 text-sm text-danger"
            >
              {error}
            </p>
          ) : null}

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              Отмена
            </Button>
            <Button
              type="submit"
              disabled={isPending || emailMissing}
            >
              {isPending ? "Создание…" : "Создать и перевести"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

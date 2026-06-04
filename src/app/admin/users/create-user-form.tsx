"use client";

import { useActionState, useState } from "react";

import {
  createUser,
  type CreateUserState,
  type SupplierOption,
} from "@/actions/admin-users";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import type { UserRole } from "@/lib/auth";

const initialState: CreateUserState = { error: null, success: null };

interface CreateUserFormProps {
  suppliers: SupplierOption[];
}

/**
 * Admin form for provisioning a new user. The supplier select is required and
 * only shown when role=supplier. Password is required (min. 8 characters).
 */
export function CreateUserForm({ suppliers }: CreateUserFormProps) {
  const [state, formAction, isPending] = useActionState(
    createUser,
    initialState,
  );
  const [role, setRole] = useState<UserRole | "">("");

  const showSupplier = role === "supplier";

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="off"
            placeholder="user@example.com"
            required
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="full_name">Полное имя</Label>
          <Input
            id="full_name"
            name="full_name"
            type="text"
            autoComplete="off"
            placeholder="Иван Иванов"
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="role">Роль</Label>
          <Select
            id="role"
            name="role"
            required
            value={role}
            onChange={(event) => setRole(event.target.value as UserRole)}
          >
            <option value="" disabled>
              Выберите роль…
            </option>
            <option value="senior_procurement">Старший снабженец</option>
            <option value="procurement">Снабженец</option>
            <option value="supplier">Поставщик</option>
            <option value="admin">Администратор</option>
          </Select>
        </div>

        {showSupplier ? (
          <div className="flex flex-col gap-2">
            <Label htmlFor="supplier_id">Поставщик</Label>
            <Select id="supplier_id" name="supplier_id" required>
              <option value="" disabled>
                Выберите поставщика…
              </option>
              {suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </option>
              ))}
            </Select>
            {suppliers.length === 0 ? (
              <p className="text-xs text-text-muted">
                Нет активных поставщиков. Сначала создайте поставщика.
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="flex flex-col gap-2">
          <Label htmlFor="password">Пароль</Label>
          <Input
            id="password"
            name="password"
            type="text"
            autoComplete="off"
            placeholder="Минимум 8 символов"
            required
            minLength={8}
          />
          <p className="text-xs text-text-muted">
            Пользователь сможет войти с этим паролем сразу после создания.
          </p>
        </div>
      </div>

      {state.error ? (
        <p
          role="alert"
          className="rounded-lg border border-danger-border bg-danger-bg px-3 py-2 text-sm text-danger"
        >
          {state.error}
        </p>
      ) : null}

      {state.success ? (
        <p
          role="status"
          className="rounded-lg border border-success-border bg-success-bg px-3 py-2 text-sm text-success"
        >
          {state.success}
        </p>
      ) : null}

      <div>
        <Button type="submit" size="lg" disabled={isPending}>
          {isPending ? "Создание…" : "Создать пользователя"}
        </Button>
      </div>
    </form>
  );
}

"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  clearViewAsUserId,
  setViewAsUserId,
  type ViewAsUsersGroup,
} from "@/actions/view-as";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";

import { FormError } from "./form-error";

function formatUserLabel(
  fullName: string | null,
  email: string | null,
): string {
  const primary = fullName?.trim() || email?.trim() || "—";
  if (email && primary !== email) {
    return `${primary} (${email})`;
  }
  return primary;
}

interface ViewAsPickerProps {
  groups: ViewAsUsersGroup[];
  currentViewAsUserId: string | null;
}

/**
 * Admin control to impersonate another user for board preview (VIEWAS-007).
 */
export function ViewAsPicker({
  groups,
  currentViewAsUserId,
}: ViewAsPickerProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [selectedId, setSelectedId] = useState(currentViewAsUserId ?? "");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSelectedId(currentViewAsUserId ?? "");
  }, [currentViewAsUserId]);

  function handleApply() {
    const trimmed = selectedId.trim();
    if (!trimmed) {
      setError("Выберите пользователя.");
      return;
    }

    setError(null);
    startTransition(async () => {
      const result = await setViewAsUserId(trimmed);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  function handleClear() {
    setError(null);
    startTransition(async () => {
      const result = await clearViewAsUserId();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSelectedId("");
      router.refresh();
    });
  }

  const hasUsers = groups.some((group) => group.users.length > 0);

  return (
    <div className="flex flex-col gap-3">
      <div>
        <p className="px-3 text-xs font-medium tracking-wide text-text-secondary uppercase">
          Просмотр от лица
        </p>
        <p className="px-3 text-xs text-text-secondary">
          Выберите пользователя и нажмите «Применить» — данные и действия на
          досках пойдут от его имени.
        </p>
      </div>

      {!hasUsers ? (
        <p className="px-3 text-sm text-text-secondary">
          Нет доступных пользователей.
        </p>
      ) : (
        <div className="flex flex-col gap-2 px-3">
          <Label htmlFor="view-as-user" className="sr-only">
            Пользователь
          </Label>
          <Select
            id="view-as-user"
            value={selectedId}
            disabled={isPending}
            onChange={(event) => setSelectedId(event.target.value)}
          >
            <option value="">— Выберите пользователя —</option>
            {groups.map((group) => (
              <optgroup key={group.role} label={group.label}>
                {group.users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {formatUserLabel(user.full_name, user.email)}
                  </option>
                ))}
              </optgroup>
            ))}
          </Select>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              disabled={isPending || !selectedId}
              onClick={handleApply}
            >
              Применить
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={isPending || !currentViewAsUserId}
              onClick={handleClear}
            >
              Сбросить
            </Button>
          </div>
        </div>
      )}

      <FormError error={error} />
    </div>
  );
}

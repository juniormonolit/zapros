import { redirect } from "next/navigation";

import {
  listSuppliers,
  listUsers,
  setUserActive,
  type AdminUserRow,
} from "@/actions/admin-users";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getProfile, homeRouteForRole, type UserRole } from "@/lib/auth";

import { CreateUserForm } from "./create-user-form";

/** Human-readable Russian labels for each role. */
const ROLE_LABELS: Record<UserRole, string> = {
  admin: "Администратор",
  procurement: "Снабженец",
  supplier: "Поставщик",
  senior_procurement: "Старший снабженец",
};

/**
 * Admin → Users. Server component: re-checks the admin role on entry (defence
 * in depth on top of middleware), then renders the create form and the user
 * table with per-row activate/deactivate actions.
 */
export default async function AdminUsersPage() {
  const profile = await getProfile();
  if (!profile) {
    redirect("/login");
  }
  if (profile.role !== "admin") {
    redirect(homeRouteForRole(profile.role));
  }

  const [users, suppliers] = await Promise.all([listUsers(), listSuppliers()]);

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Новый пользователь</CardTitle>
          <CardDescription>
            Создайте учётную запись и назначьте роль. Для поставщика обязательна
            привязка к компании-поставщику.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CreateUserForm suppliers={suppliers} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Пользователи</CardTitle>
          <CardDescription>
            Всего: {users.length}. Деактивация закрывает вход без удаления
            учётной записи.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <UsersTable users={users} currentUserId={profile.id} />
        </CardContent>
      </Card>
    </div>
  );
}

interface UsersTableProps {
  users: AdminUserRow[];
  currentUserId: string;
}

/** Renders the users table; empty state when there are no users yet. */
function UsersTable({ users, currentUserId }: UsersTableProps) {
  if (users.length === 0) {
    return (
      <p className="text-sm text-text-secondary">Пользователей пока нет.</p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-max border-collapse text-sm">
        <thead>
          <tr className="border-b border-border-primary text-left text-text-secondary">
            <th className="px-3 py-2 font-medium">Email</th>
            <th className="px-3 py-2 font-medium">Имя</th>
            <th className="px-3 py-2 font-medium">Роль</th>
            <th className="px-3 py-2 font-medium">Поставщик</th>
            <th className="px-3 py-2 font-medium">Статус</th>
            <th className="px-3 py-2 font-medium">Действие</th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <UserRow
              key={user.id}
              user={user}
              isSelf={user.id === currentUserId}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface UserRowProps {
  user: AdminUserRow;
  isSelf: boolean;
}

/** A single table row with its inline activate/deactivate form. */
function UserRow({ user, isSelf }: UserRowProps) {
  const toggleActive = setUserActive.bind(null, user.id, !user.is_active);

  return (
    <tr className="border-b border-border-primary/60">
      <td className="px-3 py-2 text-text-primary">{user.email ?? "—"}</td>
      <td className="px-3 py-2 text-text-primary">{user.full_name ?? "—"}</td>
      <td className="px-3 py-2 text-text-secondary">
        {ROLE_LABELS[user.role]}
      </td>
      <td className="px-3 py-2 text-text-secondary">
        {user.supplier_name ?? "—"}
      </td>
      <td className="px-3 py-2">
        <span
          className={
            user.is_active
              ? "rounded-full border border-success-border bg-success-bg px-2 py-0.5 text-xs text-success"
              : "rounded-full border border-border-primary bg-bg-secondary px-2 py-0.5 text-xs text-text-secondary"
          }
        >
          {user.is_active ? "Активен" : "Отключён"}
        </span>
      </td>
      <td className="px-3 py-2">
        {isSelf ? (
          <span className="text-xs text-text-muted">Вы</span>
        ) : (
          <form action={toggleActive}>
            <Button
              type="submit"
              size="sm"
              variant={user.is_active ? "destructive" : "outline"}
            >
              {user.is_active ? "Деактивировать" : "Активировать"}
            </Button>
          </form>
        )}
      </td>
    </tr>
  );
}

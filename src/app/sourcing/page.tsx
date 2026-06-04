import { CreateSupplierForm } from "@/components/sourcing/create-supplier-form";
import {
  SourcingKanban,
  type SourcingKanbanCardItem,
} from "@/components/sourcing/sourcing-kanban";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getProfile } from "@/lib/auth";
import { createClient } from "@/lib/app-client";
import { getViewAsUserIdFromCookies } from "@/lib/view-as";
import { ensureRows, type DbRow } from "@/lib/db/types";
import {
  DEFAULT_SOURCING_STATUS,
  isSourcingStatus,
} from "@/lib/sourcing";

function toKanbanItem(row: DbRow): SourcingKanbanCardItem {
  const rawStatus = String(row.sourcing_status ?? DEFAULT_SOURCING_STATUS);
  const sourcing_status = isSourcingStatus(rawStatus)
    ? rawStatus
    : DEFAULT_SOURCING_STATUS;

  return {
    id: String(row.id),
    name: String(row.name ?? ""),
    contact_person:
      row.contact_person != null ? String(row.contact_person) : null,
    phone: row.phone != null ? String(row.phone) : null,
    email: row.email != null ? String(row.email) : null,
    sourcing_status,
    works_in_zapros: Boolean(row.works_in_zapros),
  };
}

function SourcingEmptyState() {
  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle>Пока нет поставщиков</CardTitle>
        <CardDescription>
          Добавьте первого поставщика с помощью формы выше — карточка появится
          в колонке «Новый».
        </CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-text-muted">
          После создания перетаскивайте карточки по стадиям проработки или
          используйте меню на карточке.
        </p>
      </CardContent>
    </Card>
  );
}

/**
 * Senior-procurement sourcing board (`/sourcing`): kanban of supplier funnel
 * stages plus inline create form. Data is scoped by RLS (and admin view-as).
 */
export default async function SourcingPage() {
  const profile = await getProfile();
  const viewAsUserId = await getViewAsUserIdFromCookies();
  const showAdminHint =
    profile?.role === "admin" && !viewAsUserId;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("suppliers")
    .select(
      "id, name, contact_person, phone, email, sourcing_status, works_in_zapros",
    )
    .order("name", { ascending: true });

  const items = ensureRows(data).map(toKanbanItem);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <h1 className="text-xl font-semibold text-text-primary">
          Проработка поставщиков
        </h1>
      </header>

      {showAdminHint ? (
        <p className="rounded-lg border border-border-primary bg-bg-card px-4 py-3 text-sm text-text-secondary">
          Вы смотрите доску как администратор (все поставщики). Чтобы увидеть
          интерфейс старшего снабженца, выберите пользователя в блоке «Просмотр
          от лица» выше и нажмите «Применить».
        </p>
      ) : null}

      <section className="rounded-lg border border-border-primary bg-bg-card p-4">
        <h2 className="mb-3 text-sm font-medium text-text-primary">
          Новый поставщик
        </h2>
        <CreateSupplierForm />
      </section>

      {error ? (
        <p className="text-sm text-destructive" role="alert">
          Не удалось загрузить поставщиков.
        </p>
      ) : null}

      {items.length === 0 ? (
        <SourcingEmptyState />
      ) : (
        <SourcingKanban items={items} />
      )}
    </div>
  );
}

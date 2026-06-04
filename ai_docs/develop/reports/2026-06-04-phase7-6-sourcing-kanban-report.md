# Отчёт: Фаза 7.6 — Канбан проработки + Admin View As (F010)

**Дата:** 2026-06-04  
**Orchestration:** `orch-2026-06-04-phase7-6-sourcing`  
**Статус:** ✅ Завершена (8/8)  
**План:** [`ai_docs/develop/plans/2026-06-04-phase7-6-sourcing-kanban.md`](../plans/2026-06-04-phase7-6-sourcing-kanban.md)  
**Feature:** [`F010-supplier-sourcing.md`](../features/F010-supplier-sourcing.md)

---

## Summary

| Область | Реализация |
|---------|------------|
| **Канбан `/sourcing`** | 8 колонок = `SOURCING_STATUSES`; DnD через `@dnd-kit`; матрица переходов **A** (±1 по воронке, любой non-`rejected` → `rejected`, `rejected` → только `new`) |
| **Создание поставщика** | Форма на доске: имя + опциональные контакты → `createSourcingSupplier`, старт `new` |
| **`working_in_zapros`** | Без активного `profiles` (role=supplier) → `needsProvision`; модал email/пароль ≥8 → `provisionSupplierUser`, затем повтор перехода |
| **`works_in_zapros`** | `deriveWorksInZapros` + DB trigger 008 (без новых миграций) |
| **Admin View As** | Cookie `zapros_view_as_user_id`; **reads + writes** через `createClient` / `getEffectiveDbUserId()`; баннер + picker в admin/board layouts |
| **Просмотр досок** | Sidebar «Просмотр досок»: `/sourcing`, `/app`, `/supplier`; layout guards: `expected role \|\| admin` |
| **Feature flag** | `ENABLE_ADMIN_VIEW_AS` (default on); `false` → нет ссылок, picker и set cookie |

**Вне scope:** Phase 7.5 notifications, 7.7 EAV/warehouses, audit log impersonation, обязательные поля по стадиям.

---

## Ключевые файлы

| Слой | Файлы |
|------|--------|
| Config / tests | `src/lib/sourcing-kanban-config.ts`, `sourcing-kanban-config.test.ts`, `src/lib/sourcing.ts` |
| View-as | `src/lib/view-as.ts`, `view-as-policy.ts`, `src/actions/view-as.ts`, `view-as.test.ts` |
| Auth / client | `src/lib/auth.ts` (`getEffectiveProfile`), `src/lib/app-client.ts` |
| Actions | `src/actions/sourcing.ts`, `sourcing-types.ts`, `sourcing.test.ts` |
| UI sourcing | `src/components/sourcing/sourcing-kanban.tsx`, `sourcing-kanban-card.tsx`, `use-sourcing-kanban-dnd.ts`, `provision-supplier-modal.tsx`, `create-supplier-form.tsx` |
| UI admin | `src/components/admin/view-as-picker.tsx`, `view-as-banner.tsx`, `view-as-banner-slot.tsx` |
| Pages / layouts | `src/app/sourcing/page.tsx`, `sourcing/layout.tsx`; `app/layout.tsx`, `supplier/layout.tsx`; `admin/layout.tsx` |
| Nav | `src/components/navigation/nav-config.ts` (`ADMIN_BOARD_NAV`, `getAdminBoardNav`) |
| Env example | `env.production.example` |

Переиспользованы: `KanbanBoard` / `KanbanColumn` / `KanbanCard`, паттерн `useRequestKanbanDnd`, `createAuthUser` из `admin-users.ts`.

---

## Manual test checklist

1. **`senior_procurement`:** полная воронка ±1, reject из любой non-rejected, `rejected` → `new`, создание карточки в колонке `new`.
2. **Переход в `working_in_zapros`:** без supplier user → модал → provision → успешный move; без email на карточке → блок с сообщением.
3. **`procurement`:** redirect с `/sourcing`; в выборе поставщиков только `approved` / `working_in_zapros` (без изменений).
4. **`admin`:** ссылки «Просмотр досок»; view-as senior → move card на `/sourcing`; view-as procurement → `/app` загружается; view-as supplier → `/supplier` только свои invites.
5. **Без view-as:** admin пишет в suppliers через `is_admin()` RLS.
6. **`ENABLE_ADMIN_VIEW_AS=false`:** нет ссылок на доски, нет picker, set cookie отклоняется.
7. **После мутаций:** нет stale UI (`revalidatePath` на `/sourcing`, `/admin/suppliers`, `/admin/users`).

---

## Env vars

| Переменная | Назначение | Default |
|------------|------------|---------|
| `ENABLE_ADMIN_VIEW_AS` | Включить impersonation и ссылки «Просмотр досок» | `true` (любое значение кроме `false`) |
| `DATABASE_URL` | RLS через `createClient` | обязателен |
| `AUTH_SECRET` | Сессия admin | обязателен |

Локально: скопировать в `.env.local` при тесте view-as. Production: `env.production.example` → `.env.production`.

---

## Deploy notes

- **Миграции:** не требуются (воронка и trigger 008 из Фазы 2.6).
- **Сборка:** `npm run build` после деплоя кода.
- **Production:** задать `ENABLE_ADMIN_VIEW_AS=true` (или опустить); для отключения QA-режима на prod — `false`.
- **Cookie:** httpOnly `zapros_view_as_user_id`; `secure` в production.
- **Роли:** убедиться, что есть тестовый `senior_procurement` (см. `ai_docs/develop/test-users.md`).
- **Провижининг:** дубликат email → сообщение `emailExists`; один active supplier user на `supplier_id`.

---

## Верификация (авто)

lint ✅ | unit tests (`sourcing-kanban-config`, `view-as`, `sourcing` actions) ✅ | build ✅

---

## Что дальше

**Фаза 7.5** — уведомления (F009)  
**Фаза 7.7** — гибкие поля поставщиков + склады (F011)  
**F010 backlog** — обязательные поля на стадиях воронки (вне MVP)

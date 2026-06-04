# Отчёт: Фаза 7.7a — Организация поставщика (F012)

**Дата:** 2026-06-04  
**Orchestration:** `orch-2026-06-04-phase7-7-supplier-org`  
**Статус:** ✅ Завершена (10/10)  
**План:** [`ai_docs/develop/plans/2026-06-04-phase7-7-supplier-organization.md`](../plans/2026-06-04-phase7-7-supplier-organization.md)  
**Feature:** [`F012-supplier-organization.md`](../features/F012-supplier-organization.md)

---

## Summary

| Область | Реализация |
|---------|------------|
| **Модель org** | `suppliers` расширен: `supplier_kind`, `wave_priority`, `regions`, условия работы, каналы уведомлений, `share_team_responses` |
| **Membership** | Таблица `supplier_members` (`supplier_admin` / `supplier_user`); backfill из legacy `profiles.supplier_id`; двусторонний sync через trigger |
| **Операционные точки** | `supplier_warehouses`, `supplier_productions`, `supplier_vehicles` — CRUD через server actions |
| **Справочники** | `product_categories`, `product_brands` + junction `supplier_categories` / `supplier_brands`; seed базового набора |
| **RLS (вариант A)** | `admin` / `senior_procurement` — полный CRUD master-data; `procurement` — read-only на org-таблицах; `supplier_admin` — CRUD своей org |
| **Провижининг 7.6** | `createAuthUserWithProfile` создаёт первый `supplier_members` с ролью `supplier_admin` |
| **UI** | `/admin/suppliers` — таблица, фильтры, поиск; `/admin/suppliers/[id]` — вкладки (основное, контакты/аккаунты, склады, производства, автопарк, условия; документы — заглушка) |
| **Регрессия** | F010 (воронка, провижининг), F003 (запросы, invites), F004 (ответы) — unit-тесты зелёные |

**Вне scope 7.7a:** EAV (7.7b), кабинет supplier_admin (7.7c), волновая рассылка, реальная отправка уведомлений (F009), вкладка «Документы» (stub).

---

## Миграции 018–022

| # | Файл | Содержание |
|---|------|------------|
| **018** | `supabase/migrations/018_supplier_org_enums.sql` | Enums: `supplier_member_role`, `supplier_kind`, `supplier_wave_priority`, `supplier_vehicle_type`, `supplier_price_model`, `supplier_availability_status`; колонки org на `suppliers`; индексы для фильтров |
| **019** | `supabase/migrations/019_supplier_members.sql` | Таблица `supplier_members`; backfill из `profiles` (role=supplier); trigger `sync_profile_supplier_id_from_membership`; RLS enabled (политики в 022) |
| **020** | `supabase/migrations/020_supplier_sites_and_vehicles.sql` | `supplier_warehouses`, `supplier_productions`, `supplier_vehicles`; индексы по `supplier_id`; RLS enabled |
| **021** | `supabase/migrations/021_product_categories_brands.sql` | `product_categories`, `product_brands`, `supplier_categories`, `supplier_brands`; seed категорий и брендов из ТЗ |
| **022** | `supabase/migrations/022_supplier_org_rls.sql` | `current_user_supplier_id()` через membership; helpers `is_supplier_user`, `is_supplier_admin`; политики SELECT/INSERT/UPDATE/DELETE на org-таблицах (Option A) |

**Порядок деплоя:** 018 → 019 → 020 → 021 → 022 (строго последовательно).

---

## Ключевые файлы

| Слой | Файлы |
|------|--------|
| **Миграции** | `supabase/migrations/018_supplier_org_enums.sql` … `022_supplier_org_rls.sql` |
| **Server actions** | `src/actions/supplier-org.ts`, `src/actions/supplier-org-types.ts` |
| **Access / labels** | `src/lib/supplier-org-access.ts`, `src/lib/supplier-org-labels.ts` |
| **Список / фильтры** | `src/lib/supplier-list-filters.ts`, `src/lib/supplier-list-search.ts` |
| **Провижининг** | `src/lib/auth/provision-user.server.ts` (membership при создании supplier user) |
| **UI список** | `src/app/admin/suppliers/page.tsx`, `src/components/admin/supplier-org-list.tsx`, `supplier-org-create-form.tsx` |
| **UI карточка** | `src/app/admin/suppliers/[id]/page.tsx`, `src/components/admin/supplier-org-detail.tsx` |
| **Тесты** | `src/actions/supplier-org.test.ts`, `src/lib/supplier-org-access.test.ts`, `src/lib/supplier-org-migration.test.ts`, `src/lib/supplier-list-filters.test.ts`, `src/lib/supplier-list-search.test.ts`, `src/lib/supplier-org-labels.test.ts`, `src/lib/auth/provision-user.server.test.ts`; регрессия F010 — `src/actions/sourcing.test.ts` |

Переиспользованы: `provisionSupplierUser` / `createSourcingSupplier` из `src/actions/sourcing.ts`, guards `canAccessSupplierOrgAdmin` (Option A — без доступа procurement к admin UI).

---

## Acceptance criteria (F012 §7.7a)

- [x] **1.** Создать поставщика без аккаунта (`createSupplierOrg`, форма на `/admin/suppliers`)
- [x] **2.** Задать `supplier_kind`, `wave_priority` (вкладка «Основное»)
- [x] **3.** Несколько `supplier_members`, роли `supplier_admin` / `supplier_user` (вкладка «Контакты и аккаунты»)
- [x] **4.** Несколько складов, производств, машин (соответствующие вкладки)
- [x] **5.** Фильтры списка: тип, приоритет, категория, бренд, регион, активность + текстовый поиск
- [x] **6.** Карточка с вкладками; «Документы» — заглушка «Скоро»
- [x] **7.** F010, запросы, invites, `works_in_zapros` — регрессия зелёная (unit-тесты)
- [x] **8.** Провижининг 7.6 создаёт membership `supplier_admin` (`provision-user.server.ts`)

---

## Manual test checklist

1. **`admin` / `senior_procurement`:** открыть `/admin/suppliers`; создать поставщика без аккаунта; проверить появление в таблице.
2. **Фильтры:** отфильтровать по типу, приоритету волны, категории, бренду, региону, активности; текстовый поиск по имени/контактам.
3. **Карточка `/admin/suppliers/[id]`:** заполнить «Основное» (kind, priority, regions, категории/бренды); сохранить.
4. **Membership:** добавить второго пользователя (`supplier_user`); сменить роль; деактивировать; убедиться, что основной контакт на «Основном» не привязан к user_id.
5. **Склады / производства / автопарк:** CRUD по одной записи каждого типа; деактивация (`is_active`).
6. **Условия работы:** вкладка «Условия» — VAT, отсрочка, мин. сумма, доставка/самовывоз, комментарий.
7. **Документы:** вкладка показывает заглушку, без ошибок.
8. **Провижининг (F010):** на `/sourcing` перевести карточку в `working_in_zapros` → модал → provision → membership `supplier_admin` в БД; supplier login видит invites org.
9. **Регрессия запросов:** создать запрос, добавить поставщика, invite → ответ supplier user; `request_suppliers` по `supplier_id` org.
10. **`procurement`:** redirect с `/admin/suppliers`; read org-данных через RLS при необходимости (без write UI).
11. **После мутаций:** нет stale UI (`revalidatePath` на `/admin/suppliers`, `/sourcing`, `/admin/users`).

---

## Env vars / deploy

| Переменная | Назначение | Примечание для 7.7a |
|------------|------------|---------------------|
| `DATABASE_URL` | PostgreSQL + RLS | **Обязателен**; применить миграции 018–022 |
| `AUTH_SECRET` | Сессия | Без изменений |
| `CRON_SECRET` | expire-invites | Без изменений |
| `ENABLE_ADMIN_VIEW_AS` | Impersonation (7.6) | Без изменений |

**Новых env-переменных для 7.7a нет.**

Локально: `.env.local` с `DATABASE_URL` → `npm run db:migrate` (или эквивалент) → `npm run dev`.  
Production: скопировать `env.production.example` → `.env.production`; прогнать миграции на managed Postgres (Yandex) перед деплоем кода.

**Сборка:** `npm run build` ✅  
**Тесты:** `npm test` — supplier-org, supplier-list, provision-user, sourcing (157 tests) ✅

---

## Верификация (авто)

lint ✅ | unit tests (9 файлов, 157 tests) ✅ | build ✅ | migration contract tests (`supplier-org-migration.test.ts`) ✅

---

## Что дальше

| Подфаза | Содержание | Feature |
|---------|------------|---------|
| **7.7b** | EAV + правила номенклатур складов (admin-настраиваемые поля сверх структуры) | F011 |
| **7.7c** | Кабинет `supplier_admin`: «Моя организация», команда, ограниченный CRUD org | F012 |
| **7.5** | Уведомления (минимум) — после 7.7 | F009 |
| **8** | Полировка MVP | — |

**Рекомендуемый порядок:** 7.7b и 7.7c можно планировать параллельно после деплоя 7.7a; EAV не блокирует кабинет поставщика, но оба зависят от стабильного ядра org.

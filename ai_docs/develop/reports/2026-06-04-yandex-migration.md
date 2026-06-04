# Отчёт: переход с Supabase на Yandex PostgreSQL

**Дата:** 2026-06-04

## Цель

Убрать зависимость от Supabase (Auth + hosted Postgres), перенести схему и данные на **Yandex Managed PostgreSQL**, оставить приложение рабочим с RLS и текущими фичами MVP.

## Выполнено

### Инфраструктура

- Кластер Yandex, БД `zapros`, пользователь миграций, FQDN на порту 6432.
- Миграции `000_yandex_compat.sql` … `017_auth_passwords.sql` применены на Yandex.
- Скрипт `apply-migration.mjs`: подмена `TO authenticated` → `TO PUBLIC` для Yandex.
- Однократный перенос данных Supabase → Yandex (`migrate-data-supabase-to-yandex.mjs`).

### Гибридный этап (вариант A, завершён)

- Данные через `pg`, Auth ещё в Supabase — затем полностью заменён.

### Полный отказ от Supabase

- Удалены `@supabase/ssr`, `@supabase/supabase-js`, `src/lib/supabase/*`.
- Auth: `auth.users.encrypted_password`, JWT cookie, `jose` + `bcryptjs`.
- `createClient()` / `createAdminClient()` → `app-client.ts` / `admin-client.ts`.
- Nested PostgREST заменён SQL-хелперами (`db/queries/*`).
- Скрипты `create-admin`, `seed-test-users`, `expire-invites` на `pg` only.

### Исправления по ходу

- Склейка `AUTH_SECRET` с `DATABASE_URL` в `.env.local` → ETIMEDOUT при логине.
- Типизация `DbRow` → `ensureRow` / `ensureRows` по кодовой базе.
- `@types/pg`, таймауты pool, сообщения об ошибке БД при login.

## Тестовые пользователи (2026-06-04)

Повторно созданы через `npm run db:seed-test-users`. Пароль у всех: `ZaprosParty3!`. Список — в `ai_docs/develop/test-users.md`.

Admin (отдельно): создаётся `node scripts/create-admin.mjs`.

## Production checklist

1. `.env.production`: `DATABASE_URL`, `AUTH_SECRET`, `CRON_SECRET` — см. `env.production.example`.
2. IP сервера в allowlist Yandex MPG.
3. `npm run build && npm run start` (или деплой по вашему CI).
4. `npm run db:verify-yandex` с сервера (или SSH).
5. Создать prod admin, **не** использовать dev `AUTH_SECRET`.

## Что не входило в scope

- Email invite / сброс пароля (раньше Supabase invite; сейчас только пароль при создании admin).
- Переименование папки `supabase/migrations` (оставлено для совместимости с раннером).
- Удаление `migrate-data-supabase-to-yandex.mjs` (архивный инструмент).

## Итог

Приложение **полностью автономно** от Supabase в runtime. Единственный внешний data-store — Yandex PostgreSQL.

# База данных: Yandex Managed PostgreSQL

**Дата:** 2026-06-04  
**Статус:** production-ready для приложения; Supabase как runtime не используется.

## Решения по переезду

| Тема | Было (Supabase) | Стало (Yandex) |
|------|-----------------|----------------|
| Хостинг БД | Supabase Postgres | Yandex Managed PostgreSQL |
| Auth | Supabase Auth (JWT в cookies) | `auth.users` + bcrypt + JWT cookie `zapros_session` |
| Данные в приложении | PostgREST через `@supabase/ssr` | `pg` pool + PostgREST-shim (`src/lib/db/postgrest.ts`) |
| RLS | `auth.uid()` из Supabase JWT | `set_config('request.jwt.claim.sub', userId)` в транзакции |
| Роли PG `authenticated` / `anon` | Создавались Supabase | На Yandex не нужны; политики `TO PUBLIC` + проверки в SQL |
| Миграции | Supabase CLI / dashboard | `npm run db:migrate -- supabase/migrations/<file>.sql` |
| Admin API пользователей | `auth.admin.*` | `src/lib/auth/users.server.ts` + SQL |

Тестовые данные при переезде не сохранялись намеренно. Схема и миграции `000`–`017` применены на кластер Yandex.

## Переменные окружения

### Локально (`.env.local`)

```env
DATABASE_URL=postgresql://...@....mdb.yandexcloud.net:6432/zapros?sslmode=require
AUTH_SECRET=...   # ≥ 32 символов
CRON_SECRET=...   # опционально, для cron
```

Строки `PUBLIC_SUPABASE_*` / `SUPABASE_*` **не используются** и могут быть удалены.

### Production (сервер)

Скопируйте шаблон `env.production.example` в `.env.production` (или задайте те же переменные в systemd / Docker / панели хостинга):

| Переменная | Обязательна | Назначение |
|------------|-------------|------------|
| `DATABASE_URL` | да | Строка подключения к Yandex Postgres (порт **6432**, `sslmode=require`) |
| `AUTH_SECRET` | да | Секрет подписи JWT сессии; **уникальный для prod**, не копировать с dev |
| `CRON_SECRET` | для cron | Bearer-токен для `POST /api/cron/expire-invites` |

На кластере Yandex:

1. Включён **публичный доступ** (если приложение не в той же VPC).
2. IP сервера приложения в **белом списке** хоста БД.
3. Пользователь БД с правами на схемы `public` и `auth` (миграции — `zapros_migrate` или owner).

После изменения env перезапустите процесс Next.js (`next start` / PM2 / Docker).

## Как приложение ходит в БД

```
Browser
  → POST /login (Server Action signIn)
  → cookie zapros_session (JWT, sub = user id)

Middleware (Edge)
  → verify JWT (jose), без запроса в БД

Server Components / Actions
  → createClient()  → src/lib/app-client.ts
  → createDataClient(session.userId)
  → from('table').select()…  → postgrest shim → SQL + RLS

Admin / cron (без userId)
  → createAdminClient()  → src/lib/admin-client.ts
  → owner bypass RLS (таблицы принадлежат migrate-пользователю)
```

### RLS-сессия

`src/lib/db/session.ts` в транзакции:

```sql
SELECT set_config('request.jwt.claim.sub', $userId, true);
```

Функция `auth.uid()` (миграция `000_yandex_compat.sql`) читает этот claim. Политики в миграциях `003+` работают без изменений.

### Сложные выборки

Nested PostgREST (`tasks(...)`) **не поддерживается** shim'ом. Такие запросы вынесены в `src/lib/db/queries/*` (raw SQL + `withDbSession`).

### Auth-таблицы

- `auth.users`: `id`, `email`, `encrypted_password`
- Триггер `on_auth_user_created` → строка в `public.profiles`
- Логин: `findUserByEmail` → bcrypt → `setSessionCookie`

## Скрипты

| Команда | Назначение |
|---------|------------|
| `npm run db:migrate -- supabase/migrations/NNN_*.sql` | применить миграцию |
| `npm run db:verify-yandex` | проверка подключения и счётчиков |
| `node scripts/create-admin.mjs <email> <password>` | первый admin |
| `npm run db:seed-test-users` | демо-пользователи (см. `ai_docs/develop/test-users.md`) |
| `npm run db:reset-auth` | очистить `auth.users` (каскад profiles) |
| `npm run cron:expire-invites` | F007, нужен `DATABASE_URL` |

Разовый перенос с Supabase: `npm run db:migrate-data` (требует `SUPABASE_DATABASE_URL`, для prod не нужен).

## Структура кода

```
src/lib/
  app-client.ts      # createClient() для страниц и actions
  admin-client.ts    # createAdminClient() для cron и admin без RLS user
  auth/              # JWT, bcrypt, users.server.ts
  db/
    pool.ts          # pg Pool
    session.ts       # транзакции + RLS
    postgrest.ts     # .from().select().eq() shim
    queries/         # SQL для join'ов и списков
```

## Связанные документы

- [Auth и RLS](./auth-rls.md) — роли и политики (логика без изменений, другой провайдер auth)
- [Отчёт о миграции](../reports/2026-06-04-yandex-migration.md)
- [Тестовые пользователи](../test-users.md)

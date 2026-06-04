# Auth и Row Level Security

**Дата:** 2026-06-01

## Роли

| role | Доступ |
|------|--------|
| `admin` | Полный доступ на чтение/запись; управление пользователями и настройками |
| `procurement` | CRUD своих `tasks`, `requests`; чтение всех `request_suppliers` и ответов **своих** запросов |
| `supplier` | Только `request_suppliers` где `supplier_id = profile.supplier_id`; свои ответы и треды |

## Регистрация (MVP)

1. Админ создаёт пользователя в настройках (email, роль, пароль ≥ 8 символов, привязка к `supplier_id` для поставщиков).
2. Server-only: `createAuthUser` в `src/lib/auth/users.server.ts` (INSERT в `auth.users` + bcrypt).
3. Триггер создаёт `profiles`; admin upsert задаёт роль и `supplier_id`.
4. Саморегистрация **отключена**. Invite по email **не реализован** (только пароль при создании).

Сессия: JWT в cookie `zapros_session` (`AUTH_SECRET`). См. [database-yandex.md](./database-yandex.md).

## Создание `profiles`

- Триггер `on_auth_user_created` (AFTER INSERT на `auth.users`) создаёт пустой `profiles` с дефолтной ролью.
- Роль и `supplier_id` проставляет admin-экшен сразу после invite (никогда не с клиента).
- Единственный `admin` гарантируется частичным уникальным индексом (см. data-model.md); попытка создать второго админа отклоняется на уровне БД и в UI.

## Сессия и профиль

После login: JWT `sub` = `auth.users.id`; в запросах к БД выставляется `request.jwt.claim.sub` для `auth.uid()`. Middleware проверяет только наличие сессии; роль — в layouts и `/auth/redirect`:

- `/admin/*` — admin
- `/app/*` — procurement
- `/supplier/*` — supplier

## RLS-политики (схема)

### `profiles`

- SELECT: свой профиль; admin — все
- UPDATE: свой (имя); admin — все

### `tasks`

- SELECT/INSERT/UPDATE: `created_by = auth.uid()` OR admin
- DELETE: admin only (или запрет в MVP)

### `task_items`

- Доступ через `task_id` ∈ задачи пользователя

### `requests`

- SELECT/INSERT/UPDATE: через `created_by = auth.uid()` OR admin

### `request_suppliers`

- **procurement:** SELECT где `request.created_by = auth.uid()`
- **supplier:** SELECT где `supplier_id = profile.supplier_id`
- **supplier UPDATE:** прямой UPDATE статуса **запрещён**; смена статуса только через серверные экшены (`submitResponseVersion`, ответ на уточнение). RLS разрешает supplier писать только разрешённые переходы или вовсе закрывает UPDATE, а логику ведёт сервер.
- INSERT: только procurement (при отправке запроса)

### `supplier_response_versions` / `response_line_items`

- **supplier:** INSERT/UPDATE только для своего `request_supplier_id` **и только если invite в активном статусе** (`new`, `answered`, `under_review`, `clarification`, `in_progress`). В финальных (`lost`, `won`, `no_response`) и при `request.status = cancelled` — запись запрещена (блокировка ответа).
- **procurement:** SELECT для своих запросов
- **supplier:** SELECT только своих версий

### `request_events`

- SELECT/INSERT: участники пары (снабженец-владелец запроса + поставщик invite)
- **Запрет:** поставщик A не видит events поставщика B на том же `request_id`

### `suppliers`, `supplier_groups`, `bitrix_group_settings`

- SELECT: все аутентифицированные (для UI выбора)
- INSERT/UPDATE/DELETE: admin only

## Серверные операции

`createAdminClient()` (без userId в RLS-сессии) — для cron и операций, где табличный owner обходит RLS. Ранее использовался Supabase service role; см. [database-yandex.md](./database-yandex.md).

Исторически service role применялся в:

- Server Actions: парсер, invite пользователя, cron таймера
- Никогда в Client Components

## Клиент Supabase

```typescript
// Browser
createBrowserClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY)

// Server (cookies)
createServerClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY, { cookies })
```

## Проверки в приложении (дублирование RLS)

- API Route / Action: повторная проверка роли перед победой/браком.
- Поставщик не получает `request_id` чужих invites в API-ответах (только свой `request_supplier_id`).

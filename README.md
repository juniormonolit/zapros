# zapros

Приложение для отдела снабжения: публикация запросов поставщикам, сбор ответов
(цены, сроки, наличие), канбан и исходы (победа / брак с причиной). Данные задач
импортируются из Bitrix24 через copy-paste.

## Стек

- **Next.js 15** (App Router) + **React 19** + **TypeScript**
- **Tailwind CSS v4** + **shadcn/ui** (base color: neutral)
- **PostgreSQL** (Yandex Managed PostgreSQL): данные, RLS, собственная аутентификация (JWT + bcrypt)

## Требования

- Node.js 20+ (разработка ведётся на Node 22)
- npm
- Кластер PostgreSQL (см. `DATABASE_URL`)

## Переменные окружения

Создайте `.env.local` в корне проекта:

```env
DATABASE_URL=postgresql://...   # Yandex Postgres, sslmode=require
AUTH_SECRET=                    # минимум 32 символа, для подписи сессии (JWT)
CRON_SECRET=                    # опционально, для /api/cron/expire-invites
ENABLE_ADMIN_VIEW_AS=true       # production: admin «просмотр от лица» на /sourcing, /app, /supplier (false — отключить)
```

Supabase больше не используется. Старые `PUBLIC_SUPABASE_*` / `SUPABASE_SERVICE_ROLE_KEY` можно удалить.

## Первый запуск (после миграций)

```bash
npm run db:migrate -- supabase/migrations/017_auth_passwords.sql

# при необходимости сбросить тестовых пользователей Supabase Auth
node scripts/reset-auth-users.mjs

node scripts/create-admin.mjs admin@example.com 'YourPassword'
# если admin уже есть, но логин не работает:
node scripts/set-user-password.mjs admin@example.com 'YourPassword'
```

Тестовые пользователи (опционально): `npm run db:seed-test-users`

## Запуск

```bash
npm install
npm run dev          # http://localhost:3000
npm run build
npm run start
npm run lint
```

## Скрипты БД

| Команда | Назначение |
|---------|------------|
| `npm run db:migrate -- supabase/migrations/<file>.sql` | применить миграцию на Yandex |
| `npm run db:verify-yandex` | проверка подключения и счётчиков |
| `npm run db:seed-test-users` | демо-пользователи (кроме admin) |
| `npm run cron:expire-invites` | cron F007 (нужен `DATABASE_URL`) |

## Структура

```
src/
├── app/                       # маршруты (auth, admin, app, supplier, …)
├── components/
├── lib/
│   ├── auth/                  # JWT-сессия, пароли, auth.users
│   ├── db/                    # pool, RLS-сессия, PostgREST-shim, SQL-запросы
│   ├── app-client.ts          # серверный клиент данных (с RLS)
│   └── admin-client.ts        # клиент без userId (cron, admin)
└── actions/
supabase/migrations/           # SQL-миграции (применяются на Yandex)
scripts/                       # create-admin, seed, migrate, …
```

## Документация

Полная документация проекта — в [`ai_docs/README.md`](ai_docs/README.md).

# zapros

Приложение для отдела снабжения: публикация запросов поставщикам, сбор ответов
(цены, сроки, наличие), канбан и исходы (победа / брак с причиной). Данные задач
импортируются из Bitrix24 через copy-paste.

## Стек

- **Next.js 15** (App Router) + **React 19** + **TypeScript**
- **Tailwind CSS v4** + **shadcn/ui** (base color: neutral)
- **Supabase** (PostgreSQL, Auth, RLS) через `@supabase/ssr` и `@supabase/supabase-js`

## Требования

- Node.js 20+ (разработка ведётся на Node 22)
- npm

## Переменные окружения

Создайте `.env.local` в корне проекта:

```env
PUBLIC_SUPABASE_URL=
PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=   # только сервер, без префикса PUBLIC_
```

## Запуск

```bash
# установка зависимостей
npm install

# режим разработки (http://localhost:3000)
npm run dev

# production-сборка
npm run build

# запуск production-сборки
npm run start

# линтер
npm run lint
```

## Структура

```
src/
├── app/
│   ├── (auth)/login/          # вход
│   ├── (admin)/admin/         # админ-панель
│   ├── (procurement)/app/     # рабочее место снабженца
│   └── (supplier)/supplier/   # кабинет поставщика
├── components/                # UI-компоненты (shadcn/ui в components/ui)
├── lib/supabase/              # клиенты Supabase (browser / server)
└── actions/                   # Server Actions
supabase/
└── migrations/                # SQL-миграции
```

## Документация

Полная документация проекта (архитектура, модель данных, фичи, планы) —
в [`ai_docs/README.md`](ai_docs/README.md).

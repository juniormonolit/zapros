# План: Фундамент zapros (Фаза 0 + Фаза 1)

**Создан:** 2026-06-01 17:16
**Оркестрация:** orch-2026-06-01-17-16-foundation
**Статус:** 🟢 Готов к выполнению
**Всего задач:** 10
**Приоритет:** Critical / High

## Цель цикла

Получить **запускаемое приложение** на Next.js 15 (App Router) + TypeScript + Supabase (`@supabase/ssr`) + Tailwind + shadcn/ui со следующим:

- скелет проекта и структура папок из плана MVP;
- подключённый Supabase (browser/server клиенты, env);
- применённая дизайн-система (light/dark токены, CSS-переменные, скроллбары);
- базовая схема БД: `profiles` + enums + триггер профиля + единственный admin;
- справочники: `suppliers`, `supplier_groups`, `supplier_group_members`, `bitrix_group_settings`, `app_settings`;
- базовые RLS-политики на созданные таблицы;
- аутентификация: логин, middleware с разводкой по ролям (`/admin`, `/app`, `/supplier`), logout;
- админка: создание пользователей (Admin API / service_role), CRUD поставщиков/групп, `bitrix_group_settings`, `app_settings`;
- базовый layout/навигация под три роли.

Этот цикл соответствует **Фазе 0 + Фазе 1** из [2026-06-01-mvp.md](2026-06-01-mvp.md). Полный MVP (задачи, запросы, ответы, канбан, таймер) — в последующих циклах.

## Окружение

- Рабочая папка: `c:\Users\junio\projects\zapros` (Windows / PowerShell).
- Supabase project ref: `vbixjecrphhzshxabrru`. Миграции применять через Supabase MCP.
- `.env.local`: `PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (service role — только на сервере).

## Команды инициализации (PowerShell, для FND-001)

```powershell
# из c:\Users\junio\projects\zapros
npx create-next-app@latest . --typescript --tailwind --app --src-dir --eslint --use-npm --import-alias "@/*"
npx shadcn@latest init
npm install @supabase/ssr @supabase/supabase-js
```

> Примечание: `create-next-app` в непустую папку запросит подтверждение — `ai_docs/`, `design/`, `.cursor/`, `.env.local` сохранить. При необходимости использовать временную папку и перенести файлы.

## Целевая структура (из плана MVP)

```text
src/
  app/
    (auth)/login/
    (procurement)/app/
    (supplier)/supplier/
    (admin)/admin/
  components/        # ui (shadcn), navigation
  lib/
    supabase/        # client.ts, server.ts, middleware.ts
  actions/           # server actions (admin invite, CRUD)
middleware.ts        # разводка по ролям
supabase/migrations/ # 001_..., 002_...
```

---

## Задачи (по порядку выполнения)

### FND-001 — Инициализация проекта и структура папок
- **Приоритет:** Critical · **Сложность:** Moderate · **Зависимости:** нет
- **Описание:** `create-next-app` (TS, Tailwind, App Router, src-dir, import alias `@/*`), `shadcn/ui init`, установка `@supabase/ssr` и `@supabase/supabase-js`. Создать структуру папок `src/app/(auth|admin|procurement|supplier)`, `src/components`, `src/lib/supabase`, `src/actions`, `supabase/migrations`. Настроить `.gitignore`, базовый `README` проекта (кратко), не затереть `ai_docs/`, `design/`, `.cursor/`, `.env.local`.
- **Файлы/области:** `package.json`, `tsconfig.json`, `next.config.*`, `tailwind.config.*`, `postcss.config.*`, `components.json`, `src/`, `.gitignore`, `README.md`.
- **Критерии приёмки:**
  - `npm run dev` поднимает приложение без ошибок;
  - `npm run build` проходит;
  - структура папок соответствует плану; shadcn готов добавлять компоненты;
  - существующие `ai_docs/`, `design/`, `.env.local` не повреждены.

### FND-002 — Подключение Supabase (@supabase/ssr)
- **Приоритет:** Critical · **Сложность:** Moderate · **Зависимости:** FND-001
- **Описание:** Browser-клиент (`createBrowserClient`) и server-клиент (`createServerClient` с cookies) на `PUBLIC_SUPABASE_URL` / `PUBLIC_SUPABASE_ANON_KEY`. Хелпер для admin-клиента на `SUPABASE_SERVICE_ROLE_KEY` — **только в server-only модуле** (`import 'server-only'`). Типобезопасное чтение env с проверкой наличия.
- **Файлы/области:** `src/lib/supabase/client.ts`, `src/lib/supabase/server.ts`, `src/lib/supabase/admin.ts` (server-only), `src/lib/supabase/middleware.ts` (refresh session), `src/lib/env.ts`.
- **Критерии приёмки:**
  - browser-клиент работает в Client Components, server-клиент — в Server Components/Actions;
  - service_role недоступен в client bundle (server-only);
  - сессия рефрешится через middleware-хелпер;
  - сборка без утечки секретов в клиент.

### FND-003 — Дизайн-система (light/dark токены, CSS-переменные, скроллбары)
- **Приоритет:** High · **Сложность:** Moderate · **Зависимости:** FND-001
- **Описание:** Перенести токены из `design/design-system-light-dark-theme.md` в CSS-переменные (`:root` + `.dark`) и в Tailwind theme (background, text, border, accent, status, table, input, modal, scrollbar и пр.). Стили скроллбаров (WebKit + Firefox) по разделу «Scrollbar — как применять». Переключатель темы (light/dark, `next-themes` или класс на `html`).
- **Файлы/области:** `src/app/globals.css`, `tailwind.config.*`, `src/components/theme-provider.tsx`, `src/components/theme-toggle.tsx`.
- **Критерии приёмки:**
  - переключение light/dark меняет фон/текст/бордеры согласно токенам;
  - кастомные скроллбары применяются в обеих темах;
  - Tailwind-классы (`bg-card`, `text-secondary`, `border-primary`, `status-*` и т.п.) доступны и резолвятся в токены.

### FND-004 — Миграция 001: enums, profiles, триггер, один admin
- **Приоритет:** Critical · **Сложность:** Moderate · **Зависимости:** нет (можно параллельно с FND-001..003; применяется через Supabase MCP)
- **Описание:** Enum `user_role` (`admin`, `procurement`, `supplier`). Таблица `profiles` (id PK = auth.users.id, role, full_name, supplier_id uuid null, is_active, notify_email, notify_on_new_request, notify_on_completed, created_at). Триггер `on_auth_user_created` (AFTER INSERT на `auth.users`) → создаёт `profiles` с дефолтной ролью. Частичный уникальный индекс единственного admin: `CREATE UNIQUE INDEX one_admin ON profiles ((role)) WHERE role = 'admin';`. Включить RLS на `profiles` (политики — в FND-006).
- **Файлы/области:** `supabase/migrations/001_enums_profiles.sql`; применение через Supabase MCP (ref `vbixjecrphhzshxabrru`).
- **Критерии приёмки:**
  - миграция применяется без ошибок;
  - вставка в `auth.users` создаёт строку `profiles` через триггер;
  - вторая попытка создать `role='admin'` отклоняется индексом;
  - RLS включён на `profiles`.

### FND-005 — Миграция 002: справочники
- **Приоритет:** High · **Сложность:** Moderate · **Зависимости:** FND-004
- **Описание:** Таблицы `suppliers` (name, is_active), `supplier_groups`, `supplier_group_members` (M:N поставщик↔группа), `bitrix_group_settings` (name UNIQUE, url_template c `{task_id}`, is_active), `app_settings` (key-value или single-row) с дефолтами `response_deadline_days=10`, `cash_to_noncash_ratio=0.84`. Включить RLS на всех (политики — FND-006). Сид: одна запись `bitrix_group_settings` (`мск_Утеплитель`) и дефолтные `app_settings`.
- **Файлы/области:** `supabase/migrations/002_suppliers_groups.sql`; применение через Supabase MCP.
- **Критерии приёмки:**
  - все таблицы созданы, FK и UNIQUE на месте (`bitrix_group_settings.name` уникален, `(supplier_id, group_id)` уникален);
  - `app_settings` содержит дефолты 10 и 0.84;
  - RLS включён на всех новых таблицах.

### FND-006 — Базовые RLS-политики
- **Приоритет:** Critical · **Сложность:** Complex · **Зависимости:** FND-004, FND-005
- **Описание:** Политики по `auth-rls.md` для созданных таблиц. `profiles`: SELECT/UPDATE свой профиль; admin — все. `suppliers` / `supplier_groups` / `supplier_group_members` / `bitrix_group_settings` / `app_settings`: SELECT — все аутентифицированные; INSERT/UPDATE/DELETE — admin only. Helper-функция определения роли (`auth.uid()` → `profiles.role`, SECURITY DEFINER, без рекурсии RLS).
- **Файлы/области:** `supabase/migrations/003_rls_policies.sql` (часть будущего `008_rls_policies.sql`); применение через Supabase MCP.
- **Критерии приёмки:**
  - анонимный/неавторизованный доступ закрыт;
  - не-admin не может писать в справочники, но читает их;
  - admin имеет полный доступ; пользователь видит только свой `profile`;
  - нет бесконечной рекурсии в политиках `profiles`.

### FND-007 — Аутентификация: логин, middleware, logout
- **Приоритет:** Critical · **Сложность:** Complex · **Зависимости:** FND-002, FND-003, FND-004
- **Описание:** Страница `/login` (форма email/пароль на shadcn, серверный экшен входа). `middleware.ts` рефрешит сессию и разводит по ролям: `/admin/*` → admin, `/app/*` → procurement, `/supplier/*` → supplier; неавторизованных → `/login`; авторизованных с `/login` → на домашний маршрут их роли. Logout (server action, очистка сессии). Саморегистрация отключена.
- **Файлы/области:** `src/app/(auth)/login/page.tsx`, `src/actions/auth.ts`, `middleware.ts`, `src/lib/supabase/middleware.ts`, helper `getProfile()`.
- **Критерии приёмки:**
  - вход валидными кредами редиректит на маршрут роли;
  - middleware не пускает чужую роль на защищённый сегмент;
  - неавторизованный редиректится на `/login`;
  - logout завершает сессию и возвращает на `/login`.

### FND-008 — Админка: создание пользователей (Admin API)
- **Приоритет:** High · **Сложность:** Complex · **Зависимости:** FND-006, FND-007
- **Описание:** Server action на `service_role`: создание пользователя (`inviteUserByEmail` или временный пароль) с указанием роли и (для `supplier`) привязкой `supplier_id`; проставление `role`/`supplier_id` в `profiles` сразу после создания (никогда с клиента). Защита «один admin»: UI и БД-индекс отклоняют второго admin. Список пользователей с ролями/статусом, активация/деактивация (`is_active`).
- **Файлы/области:** `src/app/(admin)/admin/users/page.tsx`, `src/actions/admin-users.ts` (server-only, service_role), компоненты формы/таблицы.
- **Критерии приёмки:**
  - admin создаёт procurement и supplier; для supplier обязателен `supplier_id`;
  - попытка создать второго admin отклоняется (UI + БД);
  - service_role не утекает в клиент;
  - созданный пользователь может войти и попасть на маршрут своей роли.

### FND-009 — Админка: CRUD справочников
- **Приоритет:** High · **Сложность:** Complex · **Зависимости:** FND-006, FND-007
- **Описание:** CRUD `suppliers`; CRUD `supplier_groups` + управление членством (дерево групп с поставщиками, чекбоксы, как в `kanban-and-filters-ux.md` → «Дерево поставщиков»); CRUD `bitrix_group_settings` (name, url_template с `{task_id}`, is_active); редактирование `app_settings` (`response_deadline_days`, `cash_to_noncash_ratio`). Все мутации — server actions с проверкой роли admin (дублирование RLS).
- **Файлы/области:** `src/app/(admin)/admin/suppliers/`, `src/app/(admin)/admin/groups/`, `src/app/(admin)/admin/bitrix/`, `src/app/(admin)/admin/settings/`, `src/actions/admin-catalog.ts`.
- **Критерии приёмки:**
  - admin создаёт/редактирует/удаляет поставщиков и группы, назначает membership (M:N);
  - CRUD `bitrix_group_settings` работает, `name` уникален;
  - изменение `app_settings` сохраняется и читается приложением;
  - не-admin не имеет доступа к разделам (middleware + RLS).

### FND-010 — Базовый layout и навигация под три роли
- **Приоритет:** High · **Сложность:** Moderate · **Зависимости:** FND-003, FND-007
- **Описание:** Корневой layout с провайдером темы и тулбаром (имя пользователя, роль, theme-toggle, logout). Отдельные layout’ы сегментов: `(admin)` — навигация по разделам админки (Пользователи / Поставщики / Группы / Bitrix / Настройки); `(procurement)/app` — табы Задачи/Запросы/Таблица (заглушки на этот цикл); `(supplier)/supplier` — «Мои запросы» (заглушка). Применить дизайн-токены, адаптив (горизонтальный скролл на mobile из UX-доков).
- **Файлы/области:** `src/app/layout.tsx`, `src/app/(admin)/layout.tsx`, `src/app/(procurement)/layout.tsx`, `src/app/(supplier)/layout.tsx`, `src/components/navigation/`.
- **Критерии приёмки:**
  - каждая роль видит свою навигацию и не видит чужую;
  - тема и токены применены консистентно;
  - logout и theme-toggle доступны из шапки;
  - заглушки procurement/supplier рендерятся без ошибок.

---

## Граф зависимостей

```text
FND-001 ─┬─ FND-002 ─┬─ FND-007 ─┬─ FND-008
         ├─ FND-003 ─┘           ├─ FND-009
         │           FND-010 ────┘
FND-004 ─── FND-005 ─── FND-006 ─┘
(FND-004/005/006 — БД-ветка, может идти параллельно с 001..003)
```

Критический путь: FND-001 → FND-002 → FND-007 → FND-008/FND-009; параллельно БД-ветка FND-004 → FND-005 → FND-006 должна завершиться до FND-006-зависимых (FND-007/008/009).

## Прогресс (обновляется оркестратором)

- ✅ FND-001: Инициализация проекта и структура папок
- ✅ FND-002: Подключение Supabase (@supabase/ssr)
- ✅ FND-003: Дизайн-система (light/dark, скроллбары)
- 🚧 FND-004: Миграция 001 — SQL написан, НЕ применён (Supabase MCP errored)
- ⛔ FND-005: Миграция 002 — заблокирована (нужен доступ к БД)
- ⛔ FND-006: Базовые RLS-политики — заблокирована (нужен доступ к БД)
- ⏳ FND-007: Аутентификация — логин, middleware, logout (код можно писать, верификация требует БД)
- ⛔ FND-008: Админка — создание пользователей (нужен доступ к БД)
- ⛔ FND-009: Админка — CRUD справочников (нужен доступ к БД)
- ⏳ FND-010: Базовый layout и навигация под три роли (код можно писать)

## Архитектурные решения

- `@supabase/ssr` с cookie-сессиями; `service_role` строго в server-only модулях.
- RLS включён на всех таблицах с самого начала; роль определяется через SECURITY DEFINER helper во избежание рекурсии на `profiles`.
- Единственный admin гарантируется частичным уникальным индексом БД + проверкой в UI.
- Дизайн-токены — единый источник: CSS-переменные `:root`/`.dark`, маппинг в Tailwind theme.
- Разводка по ролям — в `middleware.ts` (плюс серверная проверка роли в каждом admin-экшене).

## Вне scope этого цикла

Парсер Bitrix, задачи/позиции, запросы, варианты ответов, канбан, треды, таймер 10 дней, уведомления — последующие циклы по плану MVP (Фазы 2–8).

## Следующий шаг

```text
/orchestrate execute orch-2026-06-01-17-16-foundation
```

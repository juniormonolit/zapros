# План: Фаза 2 — Парсер Bitrix + Задачи

**Создан:** 2026-06-02
**Оркестрация:** orch-2026-06-02-11-23-phase2
**Статус:** 🟢 Ready (готов к выполнению)
**Источник:** MVP Фаза 2 (задачи 2.1–2.4), F001, F002

## Цель

Снабженец вставляет текст задачи из Bitrix24 → парсер разбирает поля и таблицу
товаров → редактируемое превью → сохранение **Задачи** с позициями. Снабженец
видит список своих задач и карточку задачи; админ видит все. Карточка задачи
готова к Фазе 3 (создание запросов), но сами запросы НЕ реализуются в этом цикле.
Плюс косметические правки фундамента.

## Контекст и ограничения

- **ОС:** Windows / PowerShell. Команды и пути — для Windows.
- **Миграции:** применяются раннером `npm run db:migrate -- supabase/migrations/<file>.sql`
  (`scripts/apply-migration.mjs`, пулер eu-west-1, SSL, `DATABASE_URL` в `.env.local`).
  **Supabase MCP недоступен — использовать ТОЛЬКО раннер.**
- Уже применены миграции: `001_enums_profiles.sql`, `002_suppliers_groups.sql`,
  `003_rls_policies.sql`. Новые миграции — `004_*` и `005_*`.
- Паттерны RLS: см. `003_rls_policies.sql` — хелперы `public.is_admin()`,
  `public.current_user_role()` (SECURITY DEFINER, `search_path=''`), идемпотентные
  политики (`drop policy if exists` → `create policy`). Переиспользовать их.
- Server actions: `src/actions/*` (`"use server"`, `getProfile()` из `@/lib/auth`,
  клиент из `@/lib/supabase/server`). Паттерн результата экшена — как в
  `src/actions/admin-catalog.ts`.
- Дизайн-токены: `bg-bg-primary`, `bg-bg-card`, `text-text-primary/secondary`,
  `border-border-primary`, `bg-accent-primary`, статусные `text-success` и т.п.
  (схема в шапке `src/app/globals.css`). Использовать только их, без хардкода цветов.
- Тест-раннер ещё не установлен — для парсера добавить Vitest (см. BTX-003).

## Обзор задач

| ID | Название | Приоритет | Сложность | Зависимости |
|----|----------|-----------|-----------|-------------|
| BTX-001 | Миграция 004: tasks + task_items | Critical | Moderate | — |
| BTX-002 | Миграция 005: RLS для tasks/task_items | Critical | Moderate | BTX-001 |
| BTX-003 | Парсер `parseBitrixPaste` + unit-тесты | High | Complex | — |
| BTX-004 | Server actions `tasks.ts` (create + dedupe + URL) | High | Complex | BTX-001, BTX-002, BTX-003 |
| BTX-005 | UI «Новая задача» (paste → превью → сохранить) | High | Complex | BTX-003, BTX-004 |
| BTX-006 | Список задач на `/app` | High | Moderate | BTX-004 |
| BTX-007 | Карточка задачи `/app/tasks/[id]` | High | Complex | BTX-004 |
| BTX-008 | Поиск + UX дубликатов | Medium | Moderate | BTX-006, BTX-005 |
| BTX-009 | Косметика фундамента (`/` редирект, metadata) | Low | Simple | — |

## Граф зависимостей

```text
BTX-001 ─► BTX-002 ─┐
                    ├─► BTX-004 ─► BTX-005 ─► BTX-008
BTX-003 ────────────┘        └──► BTX-006 ─┘
                             └──► BTX-007
BTX-009  (независима, в любой момент)
```

Параллельно: BTX-003 (парсер) и BTX-009 (косметика) независимы от миграций и
могут идти в любой момент. После BTX-004 задачи BTX-005/006/007 можно дробить
параллельно.

## Порядок выполнения

1. BTX-001 — Миграция 004: tasks + task_items
2. BTX-002 — Миграция 005: RLS для tasks/task_items
3. BTX-003 — Парсер + unit-тесты *(test-writer)*
4. BTX-004 — Server actions `tasks.ts`
5. BTX-005 — UI «Новая задача»
6. BTX-006 — Список задач на `/app`
7. BTX-007 — Карточка задачи `/app/tasks/[id]`
8. BTX-008 — Поиск + UX дубликатов
9. BTX-009 — Косметика фундамента

## Прогресс (обновляется оркестратором)

- ✅ BTX-001: Миграция 004 tasks + task_items (Completed)
- ✅ BTX-002: Миграция 005 RLS (Completed)
- ✅ BTX-003: Парсер + unit-тесты (Completed)
- ✅ BTX-004: Server actions tasks.ts (Completed)
- ✅ BTX-005: UI «Новая задача» (Completed)
- ✅ BTX-006: Список задач /app (Completed)
- ✅ BTX-007: Карточка задачи /app/tasks/[id] (Completed)
- ✅ BTX-008: Поиск + UX дубликатов (Completed)
- ✅ BTX-009: Косметика фундамента (Completed)

**Статус плана:** 🟢 **Завершен успешно** (2026-06-02)  
**Отчет:** [`ai_docs/develop/reports/2026-06-02-phase2-bitrix-tasks-report.md`](../reports/2026-06-02-phase2-bitrix-tasks-report.md)

---

## Задачи (детально)

### BTX-001 — Миграция 004: `tasks` + `task_items`

**Приоритет:** Critical · **Сложность:** Moderate · **Зависимости:** нет

**Описание.** Создать таблицы `tasks` и `task_items` строго по
`ai_docs/develop/architecture/data-model.md`. Добавить два enum-а статусов и
индексы. Применить раннером миграций.

**Файлы/области.**
- `supabase/migrations/004_tasks_items.sql` (новый)
- Спека: `data-model.md` (`tasks`, `task_items`), `status-machines.md`

**Содержимое.**
- Enum `task_status`: `active`, `partially_closed`, `completed`, `archived`.
- Enum `line_status`: `free`, `in_request`, `closed`, `rejected`.
- Таблица `tasks`: `id uuid pk default gen_random_uuid()`,
  `created_by uuid not null references public.profiles(id)`,
  `bitrix_task_number integer not null unique`, `bitrix_url text`,
  `title text`, `manager_name text`, `delivery_address text`,
  `payment_form payment_form` (enum уже существует в 001 — проверить имя;
  если нет — создать `cash`/`non_cash`), `delivery_date date`,
  `category text`, `purposes text`, `deal_title text`,
  `requested_at timestamptz`, `raw_paste text not null`,
  `status task_status not null default 'active'`,
  `created_at timestamptz not null default now()`,
  `updated_at timestamptz not null default now()`.
- Таблица `task_items`: `id uuid pk`, `task_id uuid not null references public.tasks(id) on delete cascade`,
  `sort_order int not null default 0`, `name text not null`,
  `quantity numeric`, `unit text`, `comment text`,
  `line_status line_status not null default 'free'`.
- Индексы: `tasks(bitrix_task_number)` (уже через UNIQUE), `tasks(created_by)`,
  `task_items(task_id)`.
- Триггер/функция `updated_at` для `tasks` (или переиспользовать существующую,
  если есть в 001 — проверить).
- Идемпотентность: `create type ... ` обернуть в `do $$ begin ... exception when duplicate_object then null; end $$;` или `create extension/`-стиль; таблицы — `create table if not exists`.

**Применение (PowerShell).**
```powershell
npm run db:migrate -- supabase/migrations/004_tasks_items.sql
```

**Критерии приёмки.**
- [ ] Миграция применяется раннером без ошибок (идемпотентно при повторе).
- [ ] Существуют enum `task_status` и `line_status` с указанными значениями.
- [ ] Таблицы `tasks`, `task_items` созданы со всеми полями из data-model.md.
- [ ] `bitrix_task_number` — UNIQUE (на всю систему, не per user).
- [ ] FK `task_items.task_id` → `tasks.id` с `on delete cascade`.
- [ ] Индексы по `created_by` и `task_id` присутствуют.

> ⚠️ Перед написанием проверить фактические имена enum в `001_enums_profiles.sql`
> (`payment_form`, `user_role`) — НЕ дублировать существующие типы.

---

### BTX-002 — Миграция 005: RLS для `tasks` / `task_items`

**Приоритет:** Critical · **Сложность:** Moderate · **Зависимости:** BTX-001

**Описание.** RLS-политики по `auth-rls.md`: снабженец видит/редактирует свои
задачи (`created_by = auth.uid()`), admin — все; доступ к `task_items` — через
родительскую задачу.

**Файлы/области.**
- `supabase/migrations/005_tasks_rls.sql` (новый)
- Паттерн: `supabase/migrations/003_rls_policies.sql`; спека: `auth-rls.md`

**Содержимое.**
- `alter table public.tasks enable row level security;`
- `alter table public.task_items enable row level security;`
- `tasks`: SELECT/INSERT/UPDATE при `created_by = (select auth.uid()) or public.is_admin()`;
  DELETE — `public.is_admin()` (или запрет в MVP).
  В INSERT `with check` обязательно проверять `created_by = (select auth.uid()) or public.is_admin()`.
- `task_items`: доступ через `exists (select 1 from public.tasks t where t.id = task_items.task_id and (t.created_by = (select auth.uid()) or public.is_admin()))`
  для SELECT/INSERT/UPDATE/DELETE (с зеркалом в `with check`).
- Идемпотентность: `drop policy if exists` перед каждым `create policy`.
- Переиспользовать хелперы `public.is_admin()` из 003.

**Применение (PowerShell).**
```powershell
npm run db:migrate -- supabase/migrations/005_tasks_rls.sql
```

**Критерии приёмки.**
- [ ] RLS включён на `tasks` и `task_items`.
- [ ] Снабженец видит только свои задачи; admin — все (проверка логикой политик).
- [ ] `task_items` доступны только через задачу, которой владеет пользователь / admin.
- [ ] Миграция идемпотентна (повторный прогон не падает).
- [ ] anon (без auth) не имеет доступа.

> Решение: объединить с BTX-001 в один файл `004` ДОПУСТИМО, но по умолчанию
> держим отдельную миграцию 005, чтобы соответствовать нумерации MVP и паттерну 003.

---

### BTX-003 — Парсер `parseBitrixPaste` + unit-тесты

**Приоритет:** High · **Сложность:** Complex · **Зависимости:** нет
**Требует unit-тестов:** ДА → привлечь **test-writer**.

**Описание.** Чистая функция (без side effects) `parseBitrixPaste(raw: string): ParsedTaskPreview`,
разбирающая paste из Bitrix: поля из F001 + таблица товаров (разделитель — таб,
строки от `Продукция из товаров:` до `Общая сумма` / `добавить чек-лист`).

**Файлы/области.**
- `src/lib/parser/bitrix.ts` (новый) — функция + типы `ParsedTaskPreview`, `ParsedTaskItem`.
- `src/lib/parser/bitrix.test.ts` (новый) — unit-тесты (test-writer).
- Возможно `src/lib/parser/types.ts` для общих типов (по усмотрению worker).
- Спека: `F001-bitrix-paste-and-tasks.md`.

**Поля парсера (из F001).**
`bitrix_task_number` (из `Задача № …`, integer > 0), `manager_name` (`Менеджер:`),
`delivery_address` (`Населенный пункт:`), `purposes` (`Для каких целей:`),
`payment_form` (`Форма оплаты:` → `Нал`=`cash`, `Безнал`=`non_cash`),
`delivery_date` (`Дата поставки материала:`, формат `DD.MM.YYYY`),
`category` (`Задача в проекте (группе):`), `deal_title` (`Сделка:`),
`requested_at` (`Дата "Сделал запрос снабженцу"`, `DD.MM.YYYY HH:mm`),
`title` (заголовок/сделка), `raw_paste` (весь текст).
Таблица товаров: колонки **Товар**, **Кол-во**, **Комментарий** (остальные
колонки Bitrix — «Наша цена», «Сумма», «Цена из калькулятора», «Цена конкурента» —
НЕ импортировать).

**Требования к реализации.**
- Чистая функция, детерминированная, без обращений к БД/сети/`Date.now()`.
- Устойчивость к отсутствующим полям (возвращать `null`/пустое, не падать).
- `payment_form` распознаёт «Нал»/«Безнал» (регистр/пробелы не важны).
- `bitrix_url` НЕ собирается здесь (зависит от настроек групп) — это в BTX-004.

**Тесты (test-writer).**
- Базовый кейс — пример задачи № 113153: 4 корректные строки товаров.
- Нал/безнал → `cash`/`non_cash`.
- Парс дат `delivery_date` и `requested_at`.
- Отсутствующие/частичные поля → graceful.
- Корректная отсечка таблицы по `Общая сумма` / `добавить чек-лист`.

**Установка тест-раннера.**
```powershell
npm install -D vitest
```
Добавить скрипт `"test": "vitest run"` (и/или `"test:watch": "vitest"`) в `package.json`.

**Критерии приёмки.**
- [ ] `parseBitrixPaste` — чистая, типизированная, экспортирует `ParsedTaskPreview`.
- [ ] Paste примера 113153 даёт ровно 4 строки товаров с корректными Товар/Кол-во/Комментарий.
- [ ] Нал/безнал распознаётся.
- [ ] Запрещённые ценовые колонки не попадают в результат.
- [ ] Установлен Vitest, `npm run test` зелёный, тесты покрывают кейсы выше.

---

### BTX-004 — Server actions `src/actions/tasks.ts`

**Приоритет:** High · **Сложность:** Complex · **Зависимости:** BTX-001, BTX-002, BTX-003

**Описание.** Серверные экшены создания задачи: `createTask(parsed)` с проверкой
дубликата `bitrix_task_number`, сборкой `bitrix_url` из `bitrix_group_settings` по
категории, вставкой `tasks` + `task_items`.

**Файлы/области.**
- `src/actions/tasks.ts` (новый) — `"use server"`.
- Паттерн: `src/actions/admin-catalog.ts` (тип результата экшена, `getProfile`,
  `createClient`, `revalidatePath`).
- Спека: `F001`, `data-model.md`, `auth-rls.md`.

**Функции (минимум).**
- `createTask(parsed: ParsedTaskPreview): ActionResult<{ taskId: string } | { duplicateTaskId: string }>`
  - Получить профиль (`getProfile`), проверить роль `procurement`/`admin`.
  - Валидация: `bitrix_task_number` integer > 0, ≥1 позиция, валидная `delivery_date`.
  - **Дубликат:** найти `tasks` по `bitrix_task_number`. Если есть — вернуть понятную
    ошибку + `duplicateTaskId` (ссылка на существующую задачу), НЕ создавать.
  - **bitrix_url:** найти `bitrix_group_settings` по `name = parsed.category`;
    подставить номер в `url_template` (`{task_id}`). Если группа не найдена —
    оставить `bitrix_url` пустым/сигнал «выбрать шаблон вручную».
  - Вставить `tasks` (с `created_by = profile.id`), затем `task_items` (с `sort_order`).
  - `revalidatePath("/app")` и/или путь карточки.
- (Опц.) helper `buildBitrixUrl(category, number, settings)` — чистый, переиспользуемый.

**Критерии приёмки.**
- [ ] `createTask` создаёт `tasks` + связанные `task_items` за один логический шаг.
- [ ] Дубликат `bitrix_task_number` блокирует создание, возвращает ссылку на существующую.
- [ ] `bitrix_url` собирается из настроек группы по категории; нет группы → пусто/ручной выбор.
- [ ] `raw_paste` сохраняется в БД.
- [ ] Роль не-снабженца/не-админа отклоняется.
- [ ] Тип результата согласован с UI (как в admin-catalog).

---

### BTX-005 — UI «Новая задача» (`/app/tasks/new`)

**Приоритет:** High · **Сложность:** Complex · **Зависимости:** BTX-003, BTX-004

**Описание.** Экран создания задачи: textarea с paste → кнопка «Разобрать»
(локальный вызов парсера) → редактируемая форма превью (все поля + таблица
товаров с add/remove row) → «Сохранить» (вызов `createTask`).

**Файлы/области.**
- `src/app/app/tasks/new/page.tsx` (новый) — серверная обёртка.
- `src/components/tasks/new-task-form.tsx` (новый, client) — textarea, превью, таблица.
- Переиспользовать `src/components/ui/*` (button, input, label, card, select).
- Спека: `F001` (раздел UI, Валидация).

**Поведение.**
- «Разобрать» вызывает `parseBitrixPaste` (клиентски, парсер чистый) → заполняет форму.
- Все поля редактируемые; `payment_form` — select (cash/non_cash).
- Таблица товаров: добавить/удалить строку, поля Товар/Кол-во/Ед./Комментарий.
- Валидация на клиенте: `bitrix_task_number` > 0, ≥1 позиция, валидная дата.
- «Сохранить» → `createTask`; при успехе redirect на `/app/tasks/[id]`.
- При дубликате — показать предупреждение + ссылку на существующую задачу (см. BTX-008).
- Токены дизайн-системы, без хардкода цветов.

**Критерии приёмки.**
- [ ] Paste → «Разобрать» заполняет поля и таблицу товаров корректно.
- [ ] Поля и строки товаров редактируемы (add/remove работают).
- [ ] Нельзя сохранить без `bitrix_task_number` и без позиций.
- [ ] Успешное сохранение редиректит на карточку задачи.
- [ ] Дубликат показывает предупреждение со ссылкой на существующую задачу.

---

### BTX-006 — Список задач на `/app`

**Приоритет:** High · **Сложность:** Moderate · **Зависимости:** BTX-004

**Описание.** Заменить заглушку на `/app` списком задач снабженца: номер Bitrix,
категория, статус, счётчик запросов (пока `0/0/0` — запросы в Фазе 3), переход в карточку.

**Файлы/области.**
- `src/app/app/page.tsx` (заменить `SectionStub`).
- (Опц.) `src/components/tasks/task-list.tsx`.
- Кнопка/ссылка «Новая задача» → `/app/tasks/new`.
- Спека: `F001`, `F002` (счётчик), RLS из `auth-rls.md`.

**Поведение.**
- Server Component: загрузка задач через серверный supabase-клиент (RLS отдаёт
  снабженцу свои, админу — все).
- Колонки: № Bitrix, заголовок/сделка, категория, статус (бейдж со статусным токеном),
  счётчик запросов (завершено/в работе/всего — заглушка `0/0/0` с пометкой «Фаза 3»).
- Пустое состояние с CTA «Создать задачу».
- Клик по строке → `/app/tasks/[id]`.

**Критерии приёмки.**
- [ ] Заглушка `SectionStub` на `/app` заменена реальным списком.
- [ ] Снабженец видит свои задачи; админ — все (через RLS).
- [ ] Видны № Bitrix, категория, статус, счётчик `0/0/0`.
- [ ] Переход в карточку работает; есть пустое состояние и кнопка «Новая задача».

---

### BTX-007 — Карточка задачи `/app/tasks/[id]`

**Приоритет:** High · **Сложность:** Complex · **Зависимости:** BTX-004

**Описание.** Карточка задачи: поля задачи, ссылка на Bitrix (новая вкладка),
таблица позиций с чекбоксами и кнопкой «Создать запрос» (заглушка/disabled с
пометкой «Фаза 3»), отображение `line_status` позиций.

**Файлы/области.**
- `src/app/app/tasks/[id]/page.tsx` (новый) — server component, загрузка задачи + позиций.
- (Опц.) `src/components/tasks/task-detail.tsx`, `task-items-table.tsx` (client для чекбоксов).
- Спека: `F001` (критерии), `F002` (готовность к созданию запроса), `status-machines.md`.

**Поведение.**
- Загрузка задачи по `id` (RLS ограничивает доступ); 404/redirect если нет доступа.
- Шапка: заголовок, № Bitrix, категория, менеджер, адрес, форма оплаты, даты, статус.
- Ссылка на `bitrix_url` — `target="_blank" rel="noopener noreferrer"`.
- Таблица позиций: чекбоксы (выбор для будущего запроса), Товар/Кол-во/Ед./Комментарий,
  бейдж `line_status` (free/in_request/closed/rejected — статусные токены).
- Кнопка «Создать запрос» — **disabled** с пометкой «Фаза 3» (запросы ещё не реализованы),
  но разметка/выбор позиций готовы к подключению F002.

**Критерии приёмки.**
- [ ] Карточка показывает все поля задачи и таблицу позиций с `line_status`.
- [ ] Ссылка на Bitrix открывается в новой вкладке.
- [ ] Чекбоксы позиций работают (выбор), готовы к F002.
- [ ] Кнопка «Создать запрос» присутствует, disabled, помечена «Фаза 3».
- [ ] Доступ к чужой задаче закрыт (RLS / редирект).

---

### BTX-008 — Поиск + UX дубликатов

**Приоритет:** Medium · **Сложность:** Moderate · **Зависимости:** BTX-006, BTX-005

**Описание.** Поиск по номеру Bitrix / названию сделки на списке задач и
доведение UX предупреждения о дубликате при сохранении (ссылка «Открыть
существующую задачу»).

**Файлы/области.**
- `src/app/app/page.tsx` / `src/components/tasks/task-list.tsx` — поле поиска + фильтрация.
- `src/components/tasks/new-task-form.tsx` — баннер-предупреждение о дубликате (использует
  `duplicateTaskId` из `createTask`, см. BTX-004).
- Спека: `F001` (дубликаты), `F002` (поиск по Bitrix/сделке).

**Поведение.**
- Поиск: фильтрация по `bitrix_task_number` и `deal_title`/`title` (клиентский фильтр
  по загруженному списку или server query — на усмотрение worker).
- Дубликат при сохранении: явный баннер с понятным текстом и ссылкой на `/app/tasks/[duplicateTaskId]`.

**Критерии приёмки.**
- [ ] На списке задач есть поиск по № Bitrix и названию сделки.
- [ ] Поиск корректно фильтрует результаты, есть состояние «ничего не найдено».
- [ ] При сохранении дубликата показывается предупреждение со ссылкой на существующую задачу.

---

### BTX-009 — Косметика фундамента

**Приоритет:** Low · **Сложность:** Simple · **Зависимости:** нет

**Описание.** Убрать демо дизайн-системы и поправить метаданные приложения.

**Файлы/области.**
- `src/app/page.tsx` — заменить демо на редирект `/` → `/login`
  (`import { redirect } from "next/navigation"; export default function Home(){ redirect("/login"); }`).
- `src/app/layout.tsx` — `metadata.title`: «Create Next App» → «zapros»; добавить
  осмысленное `description` (напр. «Система запросов поставщикам по задачам Bitrix»).

**Критерии приёмки.**
- [ ] `/` редиректит на `/login` (демо-страница дизайн-системы удалена).
- [ ] `metadata.title === "zapros"`, задано описание.
- [ ] Сборка/lint без ошибок.

---

## Архитектурные решения

- **Отдельные миграции 004 (схема) и 005 (RLS)** — соответствие нумерации MVP и
  паттерну фундамента (003 — отдельная RLS-миграция). Объединение допустимо, но
  по умолчанию раздельно.
- **Парсер — чистая функция** в `src/lib/parser/bitrix.ts`, без side effects, чтобы
  быть юнит-тестируемым и переиспользуемым на клиенте (кнопка «Разобрать») и сервере.
- **Сборка `bitrix_url` — на сервере** (в `createTask`), т.к. требует чтения
  `bitrix_group_settings`; парсер от БД не зависит.
- **Запросы (Фаза 3) не реализуются:** кнопка «Создать запрос» — disabled-заглушка;
  счётчики запросов на задаче — `0/0/0`. Разметка готова к подключению F002.
- **RLS — единственный барьер доступа** + дублирующая проверка роли в экшенах.
- **Тест-раннер:** Vitest (легче для чистых функций в Next/TS), добавляется в BTX-003.

## Реализационные заметки

- Перед написанием миграций свериться с `001_enums_profiles.sql`: не дублировать
  enum `payment_form`/`user_role`, переиспользовать существующий триггер `updated_at`,
  если он есть.
- Все SQL-миграции — идемпотентны (`if not exists`, `drop policy if exists`,
  guarded `create type`).
- Применение миграций ТОЛЬКО раннером в PowerShell:
  `npm run db:migrate -- supabase/migrations/<file>.sql`.
- UI — строго дизайн-токены из `globals.css`, без хардкода цветов.
- После задач с кодом — `npm run lint` и `npm run build` должны проходить.

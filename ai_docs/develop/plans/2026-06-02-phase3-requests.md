# План: Фаза 3 — Запросы (создание и отправка)

**Создан:** 2026-06-02
**Оркестрация:** orch-2026-06-02-15-28-phase3-requests
**Статус:** 🟢 Ready
**Цель:** Снабженец из карточки задачи выбирает позиции → создаёт запрос (черновик) → превью → выбирает поставщиков (с учётом `works_in_zapros`) → отправляет; создаются `request_items` (снапшот) и `request_suppliers` (invites) с `deadline_at`; задача показывает реальный счётчик запросов.
**Документы:** F002, F003, F010, F007 (только deadline), data-model.md, status-machines.md, auth-rls.md
**Всего задач:** 9
**Приоритет:** High

## Scope этого цикла

ДЕЛАЕМ: миграция схемы запросов (009), RLS запросов (010), генерация `request_code`, модуль расчёта дедлайна, server actions создания черновика/отправки, выбор поставщиков (дерево/группы + `works_in_zapros`), UI «Создать запрос» из карточки задачи, список/карточка запроса снабженца, счётчик на задаче, добавление поставщика после отправки.

НЕ ДЕЛАЕМ (другие фазы): ответы поставщика (Фаза 4), тред/коммуникация (Фаза 5), канбан/фильтры (Фаза 6), выбор победителя / автобрак / cron-экспайр / автозакрытие дублей (Фаза 7).

## Зафиксированные принципы

- **Изоляция (RLS — главный барьер):** поставщик видит ТОЛЬКО свои `request_suppliers` (где `supplier_id = profile.supplier_id`) и связанные `request_items`/`requests` (read). Поставщик НЕ видит другие invites того же запроса и НЕ видит ответы конкурентов. Проверяется в REQ-002.
- **«1 запрос = 1 победитель»** — закладываем в модель (`winning_supplier_id`, `winning_request_supplier_id`, `outcome`, `reject_reason`), но сам выбор победителя — Фаза 7 (не реализуем).
- **`request_items` — снапшот** позиций на момент отправки (`name`/`quantity`/`unit` копируются из `task_items`).
- **`deadline_at` = `sent_at` + `app_settings.response_deadline_days` календарных дней**, таймзона Europe/Moscow. Сам экспайр/cron — Фаза 7.
- **`works_in_zapros`:** «внутри системы» (`works_in_zapros = true`) → создаётся `request_supplier`; «связаться вручную» (`approved`, не в Zapros) → invite НЕ создаётся (только информативно).
- `payment_form` и (опц.) `needs_delivery`, `comment` — копия с задачи на момент создания черновика.

## Окружение и ограничения

- Windows / PowerShell: цепочки команд через `;` (НЕ `&&`).
- Миграции применять ТОЛЬКО раннером: `npm run db:migrate -- supabase/migrations/<file>.sql`. **Supabase MCP недоступен.**
- Применены 001..008. Следующие номера — **009, 010**.
- Тесты: `npm run test` (Vitest).

## Задачи

- [ ] REQ-001: Миграция 009 — схема `requests`/`request_items`/`request_suppliers` + enums + `request_code` (⏳ Pending)
- [x] REQ-002: Миграция 010 — RLS запросов (изоляция поставщиков) (✅ Completed)
- [ ] REQ-003: Модуль расчёта дедлайна `src/lib/deadline.ts` (unit-тесты) (⏳ Pending)
- [x] REQ-004: Server actions — создание черновика и отправка запроса (✅ Completed)
- [x] REQ-005: Выбор поставщиков (дерево/группы + учёт `works_in_zapros`) (✅ Completed)
- [x] REQ-006: UI «Создать запрос» из карточки задачи (превью → отправка) (✅ Completed)
- [x] REQ-007: Список/карточка запроса у снабженца (✅ Completed)
- [x] REQ-008: Реальный счётчик запросов на задаче (✅ Completed)
- [ ] REQ-009: Добавить поставщика после отправки (⏳ Pending)

---

## REQ-001 — Миграция 009: схема запросов + enums + `request_code`

**Приоритет:** Critical
**Сложность:** Complex
**Зависимости:** нет
**Файлы/области:**
- `supabase/migrations/009_requests.sql` (создать)
- Применить: `npm run db:migrate -- supabase/migrations/009_requests.sql`
- Паттерн: `004_tasks_items.sql`, `006_sourcing_supplier_fields.sql` (идемпотентность, `create type ... / do $$ ... exception when duplicate_object`, индексы).

**Описание:**
- Enum `request_status`: `draft, new, awaiting_responses, has_response, clarification, in_progress, won, lost, no_response, cancelled`.
- Enum `request_supplier_status`: `new, answered, under_review, clarification, in_progress, lost, no_response, won` (из status-machines.md).
- Enum `request_outcome`: `won, lost, cancelled`.
- Enum `reject_reason`: `price, lead_time, availability, other_supplier_selected, customer_cancelled, no_response, other` (можно создать сейчас, использование — Фаза 7).
- Таблица `requests` со всеми полями из data-model.md: `id`, `request_code text unique not null`, `task_id fk`, `created_by fk profiles`, `status request_status not null default 'draft'`, `outcome request_outcome nullable`, `needs_delivery boolean not null default false`, `payment_form payment_form_enum` (тот же enum, что у `tasks.payment_form`), `comment text`, `winning_supplier_id uuid`, `winning_request_supplier_id uuid`, `reject_reason reject_reason nullable`, `reject_comment text`, `sent_at timestamptz`, `completed_at timestamptz`, `created_at`/`updated_at`.
- Таблица `request_items`: `id`, `request_id fk on delete cascade`, `task_item_id fk`, `name text`, `quantity numeric`, `unit text` (снапшот).
- Таблица `request_suppliers`: `id`, `request_id fk on delete cascade`, `supplier_id fk`, `status request_supplier_status not null default 'new'`, `sent_at timestamptz`, `deadline_at timestamptz`, `timer_paused_at timestamptz nullable`, `first_response_at timestamptz nullable`, `created_at`/`updated_at`; `unique (request_id, supplier_id)`.
- **`request_code`:** надёжная генерация — `create sequence request_code_seq` + функция `next_request_code()` (формат `R-<год>-<6 цифр с lpad>`, напр. `R-2026-000123`) ИЛИ default через функцию. Сделать так, чтобы код не зависел от гонок (последовательность).
- Индексы: `requests(task_id)`, `requests(created_by)`, `requests(status)`, `request_items(request_id)`, `request_items(task_item_id)`, `request_suppliers(supplier_id)`, `request_suppliers(deadline_at)`, `request_suppliers(request_id)`.
- `enable row level security` на всех трёх таблицах (политики — REQ-002).
- Идемпотентность: `create table if not exists`, guarded `create type`, `create index if not exists`.

**Критерии приёмки:**
- [ ] `npm run db:migrate -- supabase/migrations/009_requests.sql` проходит без ошибок и повторно (идемпотентно).
- [ ] Все 4 enum и 3 таблицы созданы; `request_code` UNIQUE; `unique (request_id, supplier_id)` есть.
- [ ] RLS включён на `requests`/`request_items`/`request_suppliers` (доступ закрыт до REQ-002).
- [ ] Индексы из data-model.md присутствуют.

> Примечание по нумерации: в `2026-06-01-mvp.md` исторически `009_requests` и `010_responses`. В этом цикле сознательно: **009 = схема запросов, 010 = RLS запросов**; ответы (Фаза 4) сдвигаются на 011+. Обновить порядок миграций в mvp.md при документировании.

---

## REQ-002 — Миграция 010: RLS запросов (изоляция поставщиков)

**Приоритет:** Critical
**Сложность:** Complex
**Зависимости:** REQ-001
**Файлы/области:**
- `supabase/migrations/010_requests_rls.sql` (создать)
- Применить: `npm run db:migrate -- supabase/migrations/010_requests_rls.sql`
- Паттерн: `003_rls_policies.sql`, `005_tasks_rls.sql`, `007_suppliers_sourcing_rls.sql` (хелперы `is_admin()`/`is_senior_or_admin()`/`current_user_role()`, `drop policy if exists` → `create policy`).

**Описание:**
- `requests`: SELECT/INSERT/UPDATE для `created_by = auth.uid()` OR `is_admin()`. (INSERT ограничен ролями procurement/admin.)
- `request_items`: доступ через принадлежность `request_id` (снабженец-владелец/admin); **поставщик** — SELECT только тех `request_items`, чьи `request_id` присутствуют в его `request_suppliers` (`supplier_id = profile.supplier_id`).
- `request_suppliers`:
  - **procurement:** SELECT/INSERT/UPDATE где `request.created_by = auth.uid()`.
  - **supplier:** SELECT ТОЛЬКО где `supplier_id = (select supplier_id from profiles where id = auth.uid())`. **Никаких других invites того же запроса** (изоляция конкурентов). Прямой UPDATE статуса поставщиком запрещён (смена статуса — server actions в будущих фазах).
  - **admin:** всё.
- `requests` для **поставщика:** SELECT только тех `requests`, на которые у него есть invite (read-only) — чтобы видеть позиции/условия своего приглашения; БЕЗ доступа к чужим invites.
- Хелперы переиспользовать существующие (SECURITY DEFINER, `search_path=''`).

**Критерии приёмки:**
- [ ] `npm run db:migrate -- supabase/migrations/010_requests_rls.sql` проходит идемпотентно.
- [ ] Снабженец видит/редактирует только свои запросы; admin — все.
- [ ] Поставщик A с invite на запрос не видит ни invite поставщика B (тот же `request_id`), ни его данные (проверка двумя поставщиками на одном запросе).
- [ ] Поставщик видит свои `request_items`/`request` (read), не видит чужие.
- [ ] INSERT в `requests`/`request_suppliers` поставщику запрещён.

---

## REQ-003 — Модуль расчёта дедлайна `src/lib/deadline.ts` (UNIT-ТЕСТЫ)

**Приоритет:** High
**Сложность:** Moderate
**Зависимости:** нет (можно параллельно с REQ-001/002)
**Файлы/области:**
- `src/lib/deadline.ts` (создать)
- `src/lib/deadline.test.ts` (создать — **назначить test-writer**)
- Паттерн чистых тестируемых функций: `src/lib/parser/bitrix.ts`.

**Описание:**
- Чистая функция `computeDeadline(sentAt: Date, deadlineDays: number): Date` — прибавляет `deadlineDays` **календарных** дней к `sent_at` с учётом таймзоны **Europe/Moscow** (граница суток считается по MSK; результат — `timestamptz`/ISO).
- Хелпер парсинга настройки: `parseDeadlineDays(value: string | null, fallback = 10): number` (из `app_settings.response_deadline_days`, key-value text; невалид → fallback 10, нижняя граница ≥ 1).
- Без внешних зависимостей; только pure-функции для лёгкого тестирования. (Сам экспайр/таймер/пауза — Фаза 7; здесь только расчёт `deadline_at` при отправке.)

**Критерии приёмки:**
- [ ] `computeDeadline` корректно добавляет N календарных дней (включая переход через DST/конец месяца) в Europe/Moscow.
- [ ] `parseDeadlineDays` парсит '10' → 10, обрабатывает null/мусор → 10, отрицательные/0 → fallback.
- [ ] Unit-тесты (`npm run test`) зелёные; покрыты граничные случаи.

---

## REQ-004 — Server actions: создание черновика и отправка запроса

**Приоритет:** Critical
**Сложность:** Complex
**Зависимости:** REQ-001, REQ-002, REQ-003
**Файлы/области:**
- `src/actions/requests.ts` (создать)
- Паттерн: `src/actions/tasks.ts` (дискриминированный результат `{ ok: true … } | { ok: false; error }`, `getProfile`, `createClient`, `createAdminClient` для привилегий, `revalidatePath`).

**Описание:**
- `createRequestDraft(taskId, taskItemIds[])`: валидация — роль procurement/admin; задача принадлежит снабженцу (RLS); ≥1 позиция; все `taskItemIds` принадлежат `taskId`. Создаёт `requests` (`status='draft'`, `request_code` через БД-функцию, `payment_form` = копия с задачи, `needs_delivery`/`comment` дефолты), + `request_items` снапшот (`name`/`quantity`/`unit` из `task_items`). Best-effort атомарность (как в `createTask`: при ошибке вставки items — откат через admin client).
- `sendRequest(requestId, { supplierIds, needsDelivery, comment })`: валидация прав/владения; ≥1 позиция; ≥1 поставকик «внутри системы». На сервере по `supplierIds` отфильтровать `can_receive_system_request` (`works_in_zapros = true and is_active`) — invites создаются ТОЛЬКО для них. Для каждого: `request_suppliers(status='new', sent_at=now(), deadline_at=computeDeadline(sent_at, parseDeadlineDays(app_settings)))`. Обновить `requests`: `sent_at`, `status` `draft`→`new`→`awaiting_responses`, сохранить `needs_delivery`/`comment`. Обновить `task_items.line_status='in_request'` для позиций запроса. Использовать `app_settings.response_deadline_days`.
- (Опц.) объединённый `createAndSendRequest` если UI отправляет одним шагом — допускается, но логика снапшота/инвайтов общая.
- Защита от дублей `(request_id, supplier_id)` — полагаемся на UNIQUE + `on conflict do nothing`.

**Критерии приёмки:**
- [ ] Запрос без позиций нельзя создать/отправить (ошибка).
- [ ] `request_items` содержат снапшот name/quantity/unit; `payment_form` скопирован с задачи.
- [ ] При отправке создаются `request_suppliers` ТОЛЬКО для `works_in_zapros=true`; «вручную»-поставщики invite не получают.
- [ ] `sent_at` и `deadline_at` (= sent_at + N кал. дней MSK) проставлены; статусы по status-machines.
- [ ] `task_items.line_status` включённых позиций → `in_request`.
- [ ] Чужую задачу/позиции отправить нельзя (права/владение).

---

## REQ-005 — Выбор поставщиков (дерево/группы + учёт `works_in_zapros`)

**Приоритет:** High
**Сложность:** Complex
**Зависимости:** REQ-001 (для типов), REQ-002
**Файлы/области:**
- `src/components/requests/supplier-tree.tsx` (создать) — клиентский компонент
- загрузчик данных: server action/хелпер в `src/actions/requests.ts` или `src/lib/suppliers.ts`
- Паттерн UI: `src/components/tasks/task-items-table.tsx` (чекбоксы, indeterminate, дизайн-токены `globals.css`), `src/components/ui/*`.

**Описание:**
- Загрузка поставщиков `available_for_selection` (`sourcing_status in ('approved','working_in_zapros') and is_active`), сгруппированных по `supplier_groups` (поставщик может быть в нескольких группах — рендерится в каждой; см. F003).
- Дерево с чекбоксами: родительская галочка группы = select all / indeterminate; выбор отдельных поставщиков.
- **Визуальное разделение** (учёт F010):
  - **«Внутри системы»** (`works_in_zapros = true`) → отмеченные попадают в `supplierIds` для создания invites.
  - **«Связаться вручную»** (`approved`, `works_in_zapros = false`) → показываем с телефоном/email как информативные, помечены «вне системы»; в `supplierIds` для invites НЕ идут (или идут, но сервер их отфильтрует — единая защита на сервере REQ-004).
- (Опц.) подсветка рекомендованной группы по `tasks.category` через `category_supplier_group_hints` (не автовыбор).
- Компонент возвращает наверх выбранные `supplierIds` (внутрисистемные) для передачи в `sendRequest`.

**Критерии приёмки:**
- [x] Показываются только `available_for_selection`; стадии `new…test_order`/`rejected` скрыты.
- [x] Группа-галочка выбирает всех активных членов; indeterminate при частичном выборе.
- [x] Поставщики «вне системы» визуально отделены и НЕ участвуют в создании invites.
- [x] Один поставщик в нескольких группах отображается в каждой; дублирующий выбор не создаёт дубль invite (UNIQUE + сервер).

---

## REQ-006 — UI «Создать запрос» из карточки задачи

**Приоритет:** High
**Сложность:** Complex
**Зависимости:** REQ-004, REQ-005
**Файлы/области:**
- `src/components/tasks/task-items-table.tsx` (правка: включить кнопку «Создать запрос», убрать заглушку «Фаза 3»)
- `src/components/requests/create-request-flow.tsx` (создать — модал/экран: превью → выбор поставщиков → отправка)
- `src/app/app/tasks/[id]/page.tsx` (проброс данных при необходимости)
- Паттерн: существующий preview-flow задачи (Фаза 2), `src/components/ui/*`.

**Описание:**
- Подключить существующие чекбоксы позиций: «Создать запрос» активна при ≥1 выбранной позиции.
- Шаги: **Превью** (список выбранных позиций, тумблер `needs_delivery`, поле `comment`) → **Выбор поставщиков** (встроить `supplier-tree` из REQ-005) → **Отправить** (вызов `createRequestDraft` + `sendRequest` или объединённого action).
- После успешной отправки: показать `request_code`, обновить страницу (`revalidatePath`/refresh) — позиции переходят в `in_request` (бейдж «В запросе» уже есть).
- Обработка ошибок (нет внутрисистемных поставщиков, нет позиций и т.п.) — дискриминированный результат action.

**Критерии приёмки:**
- [x] Кнопка «Создать запрос» активируется при выборе позиций; заглушка «Фаза 3» удалена.
- [x] Поток превью → поставщики → отправка работает; запрос и invites создаются.
- [x] После отправки выбранные позиции показывают статус «В запросе».
- [x] Нельзя отправить без позиций или без внутрисистемных поставщиков (внятная ошибка).

---

## REQ-007 — Список/карточка запроса у снабженца

**Приоритет:** Medium
**Сложность:** Moderate
**Зависимости:** REQ-004
**Файлы/области:**
- `src/app/app/requests/[id]/page.tsx` (создать — карточка запроса)
- секция запросов на карточке задачи `src/app/app/tasks/[id]/page.tsx` (список запросов по задаче со ссылками) и/или `src/app/app/requests/page.tsx` (список)
- Паттерн: `src/app/app/tasks/[id]/page.tsx` (server component + RLS, дизайн-токены).

**Описание:**
- На карточке задачи — раздел «Запросы»: список запросов по `task_id` (`request_code`, статус, число поставщиков, дата отправки) со ссылкой на карточку.
- Карточка запроса: позиции (`request_items`), выбранные поставщики/invites (`request_suppliers`: имя, статус, `deadline_at` — бейдж «До ответа: N дн.»), статус запроса, `needs_delivery`, `comment`, `payment_form`. Всё под RLS (только владелец/admin).
- Русские лейблы статусов `request_status` / `request_supplier_status`.

**Критерии приёмки:**
- [x] Снабженец видит список запросов задачи и открывает карточку запроса.
- [x] Карточка показывает позиции, invites со статусом и дедлайном.
- [x] Чужие запросы недоступны (RLS / notFound).

---

## REQ-008 — Реальный счётчик запросов на задаче

**Приоритет:** Medium
**Сложность:** Moderate
**Зависимости:** REQ-004
**Файлы/области:**
- (опц.) `supabase/migrations/011_task_request_counters.sql` — view `task_request_counters` (или агрегатный запрос без миграции)
- Применить (если миграция): `npm run db:migrate -- supabase/migrations/011_task_request_counters.sql`
- `src/app/app/tasks/[id]/page.tsx` и/или список задач `src/app/app/page.tsx` — заменить заглушку `0/0/0`.

**Описание:**
- Метрики (data-model.md / F002): `requests_total` = COUNT(requests по task_id); `requests_in_progress` = статус ∉ финальных (`won/lost/no_response/cancelled`); `requests_completed` = `outcome IS NOT NULL` ИЛИ статус ∈ финальных.
- Реализовать через SQL-view или прямой агрегатный запрос в server component (предпочесть запрос без новой миграции, если проще; view — если используется в нескольких местах). Если view — учесть RLS (`security_invoker`).

**Критерии приёмки:**
- [x] Счётчик на задаче показывает реальные `total/in_progress/completed`.
- [x] После создания/отправки запроса счётчик обновляется.
- [x] Заглушка `0/0/0` удалена.

---

## REQ-009 — Добавить поставщика после отправки

**Приоритет:** Medium
**Сложность:** Moderate
**Зависимости:** REQ-004, REQ-005, REQ-006
**Файлы/области:**
- `src/actions/requests.ts` (добавить `addSupplierToRequest(requestId, supplierIds[])`)
- карточка запроса `src/app/app/requests/[id]/page.tsx` (кнопка «Добавить поставщика» + переиспользовать `supplier-tree`)

**Описание:**
- На уже отправленном запросе снабженец доотправляет ещё одному/нескольким поставщикам: новый `request_supplier` со СВОИМ `sent_at=now()` и `deadline_at` (пересчёт от текущего момента), `status='new'`. Только `works_in_zapros=true`. Защита от дублей через UNIQUE `(request_id, supplier_id)` + `on conflict do nothing`. Права/владение проверяются.
- Скрыть уже добавленных поставщиков в дереве (или показать как выбранных/disabled).

**Критерии приёмки:**
- [ ] Добавление поставщика создаёт новый invite со своим `sent_at`/`deadline_at`.
- [ ] Повторное добавление того же поставщика не создаёт дубль (UNIQUE).
- [ ] Доступно только владельцу запроса/admin; только внутрисистемные поставщики.

---

## Граф зависимостей

```
REQ-001 ─┬─> REQ-002 ─┐
         │            │
REQ-003 ─┼────────────┼─> REQ-004 ─┬─> REQ-006 ─> REQ-009
         │            │            ├─> REQ-007
REQ-005 ─┘ (исп. REQ-002) ─────────┴─> REQ-008
                       REQ-005 ─> REQ-006
```

- Параллельно на старте: REQ-001 (DB) и REQ-003 (deadline util).
- REQ-005 (выбор поставщиков, UI) можно начинать после REQ-002 (RLS/типы), параллельно с REQ-004.
- Критический путь: REQ-001 → REQ-002 → REQ-004 → REQ-006.

## Архитектурные решения

- Нумерация миграций этого цикла: **009 = схема запросов**, **010 = RLS запросов** (отклонение от исходного mvp.md, где 010 был responses; ответы сдвигаются на 011+). Зафиксировать при обновлении mvp.md.
- `request_code` через БД-последовательность (`request_code_seq`) + функция — устойчиво к гонкам, без логики на клиенте.
- `deadline.ts` — отдельный pure-модуль под unit-тесты (test-writer); таймзона Europe/Moscow, кал. дни.
- `works_in_zapros`-фильтрация invites — единый барьер на сервере (REQ-004), UI лишь подсказывает.
- Изоляция конкурентов — на RLS (REQ-002), приложение дублирует проверки.
- НЕ реализуем в этом цикле: выбор победителя, автобрак, cron-экспайр, автозакрытие дублей, пауза таймера (Фаза 7).

## Прогресс (обновляется оркестратором)

- ⏳ REQ-001: Миграция 009 — схема запросов (Pending)
- ✅ REQ-002: Миграция 010 — RLS запросов (Completed)
- ⏳ REQ-003: Модуль `deadline.ts` (Pending)
- ✅ REQ-004: Server actions создания/отправки (Completed)
- ✅ REQ-005: Выбор поставщиков (Completed)
- ✅ REQ-006: UI «Создать запрос» (Completed)
- ✅ REQ-007: Список/карточка запроса (Completed)
- ✅ REQ-008: Счётчик на задаче (Completed)
- ⏳ REQ-009: Добавить поставщика после отправки (Pending)

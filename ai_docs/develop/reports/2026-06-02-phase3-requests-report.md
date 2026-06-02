# Отчёт: Фаза 3 — Запросы (выбор позиций → запрос → поставщики → отправка)

**Дата:** 2026-06-02
**Orchestration:** `orch-2026-06-02-15-28-phase3-requests`
**Статус:** ✅ Завершена (9/9 задач, APPROVE)

## Что сделано

Реализован сквозной поток снабженца: из задачи отметить позиции → создать черновик запроса →
превью (позиции, форма оплаты, доставка, комментарий) → выбрать поставщиков (дерево групп,
учёт `works_in_zapros`) → отправить приглашения. Плюс список/карточка запроса, реальный счётчик
запросов на задаче и до-приглашение поставщика после отправки.

## Задачи

| ID | Задача | Итог |
|----|--------|------|
| REQ-001 | Миграция 009: `requests`/`request_items`/`request_suppliers` + enums + `request_code` (sequence) + индексы | ✅ |
| REQ-002 | Миграция 010: RLS запросов — изоляция конкурентов на уровне БД | ✅ |
| REQ-003 | `src/lib/deadline.ts` (МСК, кал. дни) + 28 unit-тестов | ✅ |
| REQ-004 | Server actions: `createRequestDraft`, `sendRequest` | ✅ |
| REQ-005 | `SupplierPicker` (дерево групп, в системе / вручную) + `loadAvailableSuppliers()` | ✅ |
| REQ-006 | UI «Создать запрос» из карточки задачи (превью → поставщики → отправка) | ✅ |
| REQ-007 | Список `/app/requests` + карточка `/app/requests/[id]` | ✅ |
| REQ-008 | Реальный счётчик `всего/в работе/выполнено` на задаче (view 011, security_invoker) | ✅ |
| REQ-009 | `addSupplierToRequest` + UI до-приглашения на карточке запроса | ✅ |

## Архитектурные решения

- **Изоляция конкурентов — на RLS** (главный барьер). Поставщик видит только свою строку invite
  (`supplier_id = current_user_supplier_id()`), черновики невидимы (`status<>'draft' and sent_at is not null`).
  Рекурсия `requests↔request_suppliers` разорвана `SECURITY DEFINER`-хелперами (`owns_request`,
  `supplier_can_read_request`, `current_user_supplier_id`).
- **works_in_zapros — серверный барьер**: `sendRequest`/`addSupplierToRequest` перезапрашивают
  `suppliers` (`works_in_zapros=true and is_active`), список клиента не доверяется. «Вне системы»
  поставщики не получают invite, возвращаются в `skippedSupplierIds` для подсказки «связаться вручную».
- **Снапшот `request_items`**: name/quantity/unit/sort_order копируются на момент создания (независимы
  от последующих правок задачи).
- **`request_code`** через sequence + `next_request_code()` (DEFAULT), формат `R-<год МСК>-NNNNNN`,
  устойчив к гонкам.
- **Deadline** = `sent_at` + `response_deadline_days` (из `app_settings`, кал. дни, Europe/Moscow).
  У до-приглашённого поставщика — свой `sent_at`/`deadline_at` (таймер с момента добавления).
- **Откаты** без клиентских транзакций: осиротевший запрос/invites удаляются admin-клиентом
  (только cleanup, не раскрытие данных). `line_status='in_request'` — монотонно, best-effort.
- **Счётчик** — SQL-view `task_request_counters` (security_invoker, наследует RLS), агрегация без N+1.

## Скоуп

Сознательно НЕ реализовано (вынесено в Фазы 4–7): ответы поставщика, тред/коммуникация, канбан,
выбор победителя/автобрак, cron/автозакрытие/пауза таймера. `reject_reason`/`request_outcome` —
enum заведены, но не используются (задел под Фазу 7).

## Верификация

- `npm run lint` — чисто.
- `npm run test` — **73 passed** (45 парсер + 28 deadline).
- `npm run build` — зелёный; маршруты `/app/requests`, `/app/requests/[id]`, `/app/tasks/[id]/new-request`.
- Миграции 009/010/011 применены раннером, идемпотентны.
- Code review — APPROVE (ревью выполнено вручную из-за лимита API на subagent).

## Файлы

- Миграции: `supabase/migrations/009_requests.sql`, `010_requests_rls.sql`, `011_task_request_counters.sql`
- Логика: `src/lib/deadline.ts` (+test), `src/lib/suppliers-available.ts`, `src/lib/request-status.ts`,
  `src/lib/request-counters.ts`, `src/actions/requests.ts`
- UI: `src/components/requests/{supplier-picker,create-request-form,request-list,add-supplier-control}.tsx`,
  `src/app/app/tasks/[id]/new-request/page.tsx`, `src/app/app/requests/page.tsx`,
  `src/app/app/requests/[id]/page.tsx`
- Правки: `src/components/tasks/task-items-table.tsx`, `src/app/app/tasks/[id]/page.tsx`,
  `src/app/app/page.tsx`, `src/components/tasks/task-list.tsx`

## Что дальше

Фаза 4 — ответы поставщика (ЛК поставщика: входящие запросы → заполнение цен/сроков/наличия →
версии ответов), либо Фаза 7.7 (поставщики как гибкая БД + склады, F011). Порядок — на выбор.

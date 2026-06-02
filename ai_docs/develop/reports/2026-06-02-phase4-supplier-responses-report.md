# Отчёт: Фаза 4 — Ответ поставщика (F004)

**Дата:** 2026-06-02
**Orchestration:** `orch-2026-06-02-phase4-supplier-responses`
**Статус:** ✅ Завершена (9/9 задач)

## Что сделано

Поставщик может ответить на входящий запрос по строкам (до 3 вариантов цены, доставка, наличие XOR срок),
отправить новую версию ответа; снабженец видит сравнительную таблицу с подсветкой лучшей цены и историю версий.

## Задачи

| ID | Задача | Итог |
|----|--------|------|
| RSP-001 | Миграция 012: `supplier_response_versions`, `response_line_items`, CHECK XOR, partial unique `is_current` | ✅ |
| RSP-002 | Миграция 013: RLS (изоляция конкурентов, active invite) | ✅ |
| RSP-003 | `src/lib/price-compare.ts` + 21 unit-тест | ✅ |
| RSP-004 | `submitResponseVersion` в `src/actions/responses.ts` | ✅ |
| RSP-005 | ЛК поставщика — список `/supplier` | ✅ |
| RSP-006 | Форма ответа `/supplier/requests/[inviteId]` | ✅ |
| RSP-007 | `VersionHistory` (поставщик + снабженец) | ✅ |
| RSP-008 | Сравнительная таблица на `/app/requests/[id]` | ✅ |
| RSP-009 | Статус «Дан ответ» в заголовке колонки (в RSP-008) | ✅ |

## Архитектурные решения

- **Валидация XOR** на трёх уровнях: CHECK в БД (012), server action (004), UI (006).
- **Версии:** partial unique `(request_supplier_id) WHERE is_current`; при новой версии flip `is_current`.
- **Статусы invite/request:** обновление через `createAdminClient` (RLS 010 не даёт supplier UPDATE на invites).
  - Invite: `new` → `answered`, `first_response_at` при первом ответе.
  - Request: при первом ответе по запросу → `has_response` (если был `awaiting_responses`/`new`).
- **Изоляция:** поставщик видит/пишет только свои версии; снабженец — все ответы своих запросов; конкуренты изолированы.
- **Сравнение цен:** `min(without_vat, with_vat, cash/ratio)`; ratio из `app_settings.cash_to_noncash_ratio` (0.84).
- **`request_events`:** не реализовано (Фаза 5). **`under_review`:** не делаем автопереход при просмотре.

## Верификация

- `npm run lint` — чисто
- `npm run test` — **94 passed** (45 parser + 28 deadline + 21 price-compare)
- `npm run build` — зелёный; маршруты `/supplier`, `/supplier/requests/[inviteId]`, обновлён `/app/requests/[id]`
- Миграции 012/013 применены раннером

## Маршруты для теста

1. Снабженец: задача → создать запрос → отправить поставщику с `works_in_zapros`.
2. Поставщик: `/supplier` → «Ответить» → заполнить форму → отправить.
3. Снабженец: `/app/requests/[id]` → «Сравнение ответов», история версий, badge «Лучшая цена».

## Что дальше

- **Фаза 5** — коммуникация (`request_events`, тред, быстрые сигналы, уточнение + пауза таймера).
- **Фаза 6** — канбан и фильтры.
- **Фаза 7** — победа/брак, cron таймера.
- **Фаза 7.7** — поставщики как гибкая БД + склады (F011).

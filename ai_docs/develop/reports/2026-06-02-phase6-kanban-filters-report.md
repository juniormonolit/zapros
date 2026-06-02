# Отчёт: Фаза 6 — Канбан и фильтры (F005)

**Дата:** 2026-06-02
**Orchestration:** `orch-2026-06-02-phase6-kanban-filters`
**Статус:** ✅ Завершена (9/9)

## Что сделано

### Снабженец
- **`/app`** — канбан задач по `tasks.status` (list/kanban toggle), счётчики запросов на карточках
- **`/app/requests`** — канбан запросов с DnD + переключатель список/канбан; фильтры (даты, статус, категория, Bitrix, поставщик); «Показать завершённые»; пресет «Запрос в работе»
- **`/app/table`** — табличный вид с теми же фильтрами и сортировкой

### Поставщик
- **`/supplier`** — канбан по `request_suppliers.status`, read-only; скрыты `lost`/`no_response` по умолчанию; фильтры в drawer на mobile

### Backend
- `src/lib/kanban-config.ts` — колонки, матрица ручных переходов, фильтры
- `updateRequestStatus` — ручная смена статуса (без `won`/`lost` — Phase 7); sync invites при `in_progress`; `status_change` events

### Зависимости
- `@dnd-kit/core`, `@dnd-kit/utilities`

## Верификация

lint ✅ | **106 tests** ✅ | build ✅

## Критерии F005

- [x] По умолчанию не видны won/lost/no_response/cancelled
- [x] Пресет «Запрос в работе»
- [x] Таблица и канбан — одни данные, разный вид
- [x] RLS — только свои задачи/запросы

## Что дальше

**Фаза 7** — выбор победителя, автобрак, cron таймера, `won`/`lost` на доске.

# Отчёт: Фаза 7 — Финал, победитель, cron таймера (F007)

**Дата:** 2026-06-02  
**Orchestration:** `orch-2026-06-02-phase7-finalization-timer`  
**Статус:** ✅ Завершена (9/9)

## Что сделано

### Backend
- **`src/lib/request-finalization-types.ts`** — `RejectReason`, `MANUAL_REJECT_REASONS`, `REJECT_REASON_LABELS`, константы финальных статусов
- **`src/lib/request-finalization.ts`** — `canFinalizeRequest`, `inviteHasResponse`, `validateManualRejectReason`, `findOpenDuplicateRequestIds`, закрытие позиций, автозакрытие дублей, события финализации
- **`src/actions/requests.ts`** — `selectWinner`, `rejectRequest`; `updateRequestStatus` направляет на эти actions для `won`/`lost`
- **`src/lib/deadline.ts`** — `extendDeadlineByPauseDuration`; пауза при уточнении и продление при ответе
- **`src/lib/expire-invites.ts`** + **`scripts/expire-invites.mjs`** + **`/api/cron/expire-invites`** — истечение invites без ответа (не трогает paused)

### UI
- **`RequestFinalizationControls`** на `/app/requests/[id]` — «Выбрать победителя» и «Закрыть браком» с выбором причины и комментарием для «Другое»; только invites с ответом для победы

### Kanban
- `won` / `lost` / `no_response` / `cancelled` уже в `REQUEST_KANBAN_HIDDEN_STATUSES` — видны при «Показать завершённые» (Фаза 6)

## Верификация

lint ✅ | **126 tests** ✅ | build ✅

## Критерии F007

- [x] Выбор победителя с причиной отказа для остальных
- [x] Закрытие браком без победителя
- [x] Автозакрытие дублирующих open-запросов при победе
- [x] `line_status` closed/rejected на позициях задачи
- [x] Продление deadline после паузы уточнения
- [x] Cron expire invites (10 р.д., только `new` без pause)
- [x] UI на карточке запроса

## Деплой / ops

- Задать `CRON_SECRET` в env
- Планировщик: `npm run cron:expire-invites` ежедневно (~09:00 MSK) или вызов `GET/POST /api/cron/expire-invites` с `Authorization: Bearer <CRON_SECRET>`

## Что дальше

**Фаза 7.5** — уведомления (F009)  
**Фаза 7.6** — канбан проработки `/sourcing` (F010)  
**Фаза 7.7** — гибкие поля поставщиков + склады (F011)

# Plan: Фаза 7 — Победа, брак, таймер (F007)

**Created:** 2026-06-02  
**Orchestration:** `orch-2026-06-02-phase7-finalization-timer`  
**Goal:** Завершение запросов (победа / брак), автозакрытие дублей, продление дедлайна после паузы, cron истечения invites  
**Status:** 🟢 Ready  
**Total Tasks:** 9  
**Feature doc:** [`F007-win-reject-timer.md`](../features/F007-win-reject-timer.md)  
**Architecture:** [`status-machines.md`](../architecture/status-machines.md), [`data-model.md`](../architecture/data-model.md)

## Контекст

- **Завершено:** Фазы 0–6. Миграции **001..015** применены.
- **Новые миграции:** **не ожидаются** (016+ только если при реализации не хватает enum/event_type — поля `winning_*`, `reject_reason`, `timer_paused_at`, `deadline_at` уже в `009_requests.sql`).
- **Есть:** `updateRequestStatus` (ручные рабочие колонки; `won`/`lost` заблокированы), `requestClarification` / `resumeFromClarification`, `submitResponseVersion` (снимает `timer_paused_at`, **без** продления `deadline_at`), `deadline.ts` (compute/parse/overdue/daysUntil), канбан с скрытыми `won`/`lost`/`no_response`/`cancelled` (`kanban-config.ts`).
- **Cron:** Supabase MCP / Edge Function **не использовать**. Истечение — `scripts/expire-invites.mjs` (service role) + опционально `src/app/api/cron/expire-invites/route.ts` (`CRON_SECRET`) + `npm run cron:expire-invites`.
- **Вне scope:** Phase 7.5 (notifications), 7.6 (sourcing kanban), 7.7 (suppliers DB / EAV).

## Архитектурные решения

| Решение | Выбор |
|--------|--------|
| Финализация | Общий модуль `src/lib/request-finalization.ts` (pure helpers + orchestration steps); server actions `selectWinner` / `rejectRequest` в `src/actions/requests.ts` (или `request-finalization-actions.ts`). |
| Auth / UPDATE | Как Phase 4–6: `getProfile` + RLS read (user client), мутации через **admin client** после проверки владельца/роли (`procurement` \| `admin`). |
| Победа MVP | «1 запрос = 1 победитель»; `reject_reason` **одна** на всех проигравших invites + на запросе; отменить победу нельзя. |
| Проигравший invite | Победитель → `won`; остальные → `lost` + общий `reject_reason` / `reject_comment`. |
| Дубли позиций | После победы: другие **открытые** запросы с пересечением `task_item_id` → `status=cancelled`, `outcome=cancelled`, invites → `lost` + `other_supplier_selected`, системные `request_events`. |
| Брак без победителя | Запрос → `lost`, `outcome=lost`; все invites → `lost`; `task_items` строк запроса → `line_status=rejected` (позиции не `closed`). |
| Пауза таймера | При выходе из `clarification` (`resumeFromClarification`, `submitResponseVersion` с `timer_paused_at`): `deadline_at += (now - timer_paused_at)`; `timer_paused_at = null`. Вынести в `extendDeadlineByPauseDuration` в `deadline.ts`. |
| Истечение | Pure `src/lib/expire-invites.ts`: кандидаты `new` (и др. «ожидает ответ» **без** паузы), `now > deadline_at` → `no_response` + event; затем агрегация запроса (`aggregateRequestStatus` / отдельная ветка «все no_response, нет ответов»). |
| Канбан | Колонки `won`/`lost`/`no_response`/`cancelled` уже в `REQUEST_KANBAN_HIDDEN_STATUSES`; задача — убедиться, что `showCompleted` и фильтры показывают финалы (без новой миграции). |
| События | `status_change` на invite/request; для автозакрытия дублей — системное событие (payload: `duplicate_cancelled`, winning `request_id`) на anchor invite каждого затронутого запроса. |
| Тесты | Vitest: `request-finalization.test.ts`, `expire-invites.test.ts`, расширить `deadline.test.ts` для extend-by-pause. |

### Статусы invite, участвующие в expire (F007)

Истекают (таймер тикает): в первую очередь `new` (ещё нет ответа).  
**Не истекают:** `clarification` (пауза, `timer_paused_at IS NOT NULL`), финалы `lost`/`won`/`no_response`, ответные `answered`/`under_review`/`in_progress`.

### Матрица: кто может финализировать

| Действие | Условия запроса | Условия invites |
|----------|-----------------|-----------------|
| `selectWinner` | Не `draft`/`won`/`lost`/`cancelled`; ≥1 invite с ответом (`first_response_at` или текущая версия) | Победитель — invite этого запроса, не финальный; остальные активные → `lost` |
| `rejectRequest` | То же, без уже выбранного победителя | Все → `lost` |

`updateRequestStatus` по-прежнему **отклоняет** `won`/`lost` — финал только через новые actions.

## Зависимости (граф)

```
WIN-001 ─┬─→ WIN-002 ─┐
         ├─→ WIN-003 ─┼─→ WIN-005
         └─→ WIN-008 ─┘

WIN-004 (deadline extend) ─→ правки events.ts + responses.ts

WIN-006 ─→ WIN-007

WIN-009 — после WIN-001 (конфиг уже есть; smoke-проверка)
```

**Параллельно после WIN-001:** WIN-002, WIN-003, WIN-004, WIN-006.

## Progress

- ✅ WIN-001: Модуль `request-finalization.ts`
- ✅ WIN-002: `selectWinner`
- ✅ WIN-003: `rejectRequest`
- ✅ WIN-004: Продление `deadline_at` после паузы
- ⏳ WIN-005: UI диалоги на `/app/requests/[id]`
- ✅ WIN-006: `expire-invites.ts` + логика агрегации
- ✅ WIN-007: Cron script + API + `npm run cron:expire-invites`
- ⏳ WIN-008: Тесты finalization + expire + deadline extend
- ⏳ WIN-009: Канбан — финальные колонки при `showCompleted`

---

## WIN-001: Модуль `request-finalization.ts`

| | |
|---|---|
| **Priority** | Critical |
| **Complexity** | Complex |
| **Dependencies** | None |
| **Agent** | worker |

### Описание

`src/lib/request-finalization.ts` — переиспользуемая логика (часть pure, часть с inject Supabase clients):

1. **Типы:** `RejectReason` (из DB enum), входные параметры финализации.
2. **Валидация:** запрос не в `FINAL_REQUEST_STATUSES` / `BLOCKED_REQUEST_STATUSES`; `reject_reason` обязателен для брака; для победы — invite принадлежит запросу, есть ответ.
3. **`closeTaskItemsForWin(requestItemIds)`** → `task_items.line_status = 'closed'`.
4. **`rejectTaskItemsForLoss(taskItemIds)`** → `line_status = 'rejected'`.
5. **`cancelDuplicateRequests(params)`** — по `request_items.task_item_id` найти другие запросы того же `task_id` в статусах не-финал (`draft` исключить); для каждого: `requests` → `cancelled`/`outcome=cancelled`, `completed_at`; все invites → `lost`, `reject_reason=other_supplier_selected`; events (author = procurement user id).
6. **`insertFinalizationEvents`** — batch `status_change` для request + invites; опционально payload для duplicate cancel.
7. Экспорт констант открытых статусов запроса для duplicate scan: `OPEN_REQUEST_STATUSES_FOR_DUPLICATES`.

Не вызывать revalidate из lib — только из actions.

### Файлы

- `src/lib/request-finalization.ts`
- (опционально) `src/lib/reject-reason.ts` — labels для UI enum

### Критерии приёмки

- [ ] Duplicate cancel закрывает **весь** запрос-дубль, даже если в нём есть другие позиции (MVP правило)
- [ ] Pure-функции покрываемы unit-тестами без DB
- [ ] Нет дублирования логики между `selectWinner` и `rejectRequest`

---

## WIN-002: Server action `selectWinner`

| | |
|---|---|
| **Priority** | Critical |
| **Complexity** | Complex |
| **Dependencies** | WIN-001 |
| **Agent** | worker |

### Описание

`selectWinner(requestId, winningRequestSupplierId, rejectReason, rejectComment?)` в `src/actions/requests.ts`:

1. Auth: `procurement` \| `admin`.
2. Load request + invites + request_items (user client, RLS).
3. Validate: не финал; победитель существует; у победителя есть ответ; `rejectReason` валиден (не `other_supplier_selected` для ручного выбора — только для автозакрытия дублей).
4. Admin transaction-like sequence (best-effort без PG transaction в JS):
   - `requests`: `status=won`, `outcome=won`, `winning_supplier_id`, `winning_request_supplier_id`, `reject_reason`, `reject_comment`, `completed_at=now`
   - Победитель invite: `won`
   - Остальные invites запроса: `lost` + тот же `reject_reason` (поля на invite если есть в схеме — иначе только статус; причина на уровне request)
   - `closeTaskItemsForWin` для `task_item_id` из `request_items`
   - `cancelDuplicateRequests`
   - Events через WIN-001
5. `revalidatePath`: `/app/requests`, `/app/table`, `/app/requests/[id]`, `/app/tasks/[taskId]`, `/supplier` paths при необходимости.

Убрать/обновить сообщение в `updateRequestStatus` про «следующая фаза» — финал теперь через `selectWinner`.

### Файлы

- `src/actions/requests.ts`
- `src/lib/request-finalization.ts`

### Критерии приёмки

- [ ] Повторный вызов на `won` → ошибка
- [ ] Проигравшие invites `lost`, одна причина
- [ ] Дублирующие запросы отменены с `other_supplier_selected`
- [ ] `task_items` победивших позиций → `closed`

---

## WIN-003: Server action `rejectRequest`

| | |
|---|---|
| **Priority** | Critical |
| **Complexity** | Moderate |
| **Dependencies** | WIN-001 |
| **Agent** | worker |

### Описание

`rejectRequest(requestId, rejectReason, rejectComment?)`:

1. Auth + load как WIN-002.
2. Validate: не финал; `rejectReason` required; при `other` — желателен `rejectComment`.
3. Admin updates:
   - `requests`: `status=lost`, `outcome=lost`, `reject_reason`, `reject_comment`, `completed_at`; **не** заполнять `winning_*`
   - Все invites → `lost`
   - `rejectTaskItemsForLoss` для позиций запроса
   - Events
4. Revalidate paths как WIN-002.

**Не вызывать** `cancelDuplicateRequests` (только при победе).

### Критерии приёмки

- [ ] Все invites `lost` с согласованной причиной на запросе
- [ ] `won`/`lost` повторно заблокированы
- [ ] Позиции запроса → `rejected` (не `closed`)

---

## WIN-004: Продление `deadline_at` после паузы

| | |
|---|---|
| **Priority** | High |
| **Complexity** | Moderate |
| **Dependencies** | None (можно параллельно WIN-001) |
| **Agent** | worker |

### Описание

1. `deadline.ts`: `extendDeadlineByPauseDuration(deadlineAt, pausedAt, resumedAt)` — добавить к `deadline_at` длительность паузы (`resumedAt - pausedAt`), сохранить MSK wall-clock семантику (или ms-add если проще и согласовано с тестами).
2. `resumeFromClarification` (`events.ts`): перед UPDATE загрузить `deadline_at`, `timer_paused_at`; вычислить новый `deadline_at`; clear pause.
3. `submitResponseVersion` (`responses.ts`): при `clearTimerPause` — то же продление (invite был в `clarification`).
4. UI: бейдж дедлайна на карточке поставщика уже есть (`describeDeadline`) — без обязательных изменений, если даты корректны.

### Файлы

- `src/lib/deadline.ts`
- `src/actions/events.ts`
- `src/actions/responses.ts`

### Критерии приёмки

- [ ] Пауза 2 дня → дедлайн сдвигается на 2 дня
- [ ] `timer_paused_at` сбрасывается после resume/submit
- [ ] Unit-тесты в `deadline.test.ts`

---

## WIN-005: UI — победа и брак на `/app/requests/[id]`

| | |
|---|---|
| **Priority** | High |
| **Complexity** | Moderate |
| **Dependencies** | WIN-002, WIN-003 |
| **Agent** | worker |

### Описание

1. **`SelectWinnerDialog`**: список invites с ответом (radio); select `reject_reason` + optional comment для проигравших; submit → `selectWinner`.
2. **`RejectRequestDialog`**: причина брака + comment; submit → `rejectRequest`.
3. Размещение: header карточки запроса или блок «Сравнение ответов» — кнопки «Выбрать победителя» / «Закрыть браком».
4. **Disable** если `request.status` ∈ `won`|`lost`|`cancelled`|`no_response` или нет ответов (для победы).
5. Показ итога: badge статуса + `reject_reason` label + `completed_at` при финале.
6. Использовать `reject-reason` labels (RU) из lib.

### Файлы

- `src/components/requests/select-winner-dialog.tsx`
- `src/components/requests/reject-request-dialog.tsx`
- `src/app/app/requests/[id]/page.tsx`
- (опционально) `src/lib/reject-reason.ts`

### Критерии приёмки

- [ ] Диалоги недоступны на финальном запросе
- [ ] Победитель выбирается только среди invites с ответом
- [ ] Ошибки action показываются пользователю (toast/inline)

---

## WIN-006: `expire-invites.ts` — pure + runner

| | |
|---|---|
| **Priority** | High |
| **Complexity** | Complex |
| **Dependencies** | WIN-001 (shared event helpers) |
| **Agent** | worker |

### Описание

`src/lib/expire-invites.ts`:

1. **Pure:** `isInviteExpirable(status, timerPausedAt, deadlineAt, now)` → boolean.
2. **Pure:** `computeExpiredInviteUpdates(invites, now)` → список id → `no_response`.
3. **Pure:** `aggregateRequestAfterExpire(inviteStatuses, hasAnyResponse)` → `no_response` \| null (если все `no_response` и нет ни одного `first_response_at` / answered family).
4. **`runExpireInvites(admin, options)`** — загрузка кандидатов (`deadline_at < now`, status in expirable set, `timer_paused_at IS NULL`), batch update, `insertStatusChangeEvent` per invite, пересчёт `requests.status` для затронутых, `completed_at` при полном `no_response` архиве.

Использовать `Europe/Moscow` / `isOverdue` из `deadline.ts`.

### Файлы

- `src/lib/expire-invites.ts`
- Reuse `request-events-helpers.ts`

### Критерии приёмки

- [ ] `clarification` с паузой не истекает
- [ ] Просроченный `new` → `no_response` + event
- [ ] Запрос без единого ответа и все invites `no_response` → request `no_response`

---

## WIN-007: Cron — script, API route, npm script

| | |
|---|---|
| **Priority** | High |
| **Complexity** | Moderate |
| **Dependencies** | WIN-006 |
| **Agent** | worker |

### Описание

1. **`scripts/expire-invites.mjs`**: load env (`SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`); import/call runner (через dynamic import compiled logic или duplicate thin wrapper — предпочтительно вызов TS через `node --import tsx` **или** дублировать минимальный fetch в .mjs вызывающий `runExpireInvites` из собранного модуля; **простой путь:** .mjs импортирует из `../src/lib/expire-invites.ts` с `tsx` devDependency или compile step — зафиксировать в README plan: добавить `tsx` как devDep для script, либо REST-only script вызывающий API route).
2. **`src/app/api/cron/expire-invites/route.ts`**: `GET`/`POST` с header `Authorization: Bearer ${CRON_SECRET}`; вызывает `runExpireInvites`.
3. **`package.json`**: `"cron:expire-invites": "node scripts/expire-invites.mjs"`.
4. **`.env.example`**: `CRON_SECRET=` (комментарий для Vercel Cron).

### Файлы

- `scripts/expire-invites.mjs`
- `src/app/api/cron/expire-invites/route.ts`
- `package.json`
- `.env.example` (если есть)

### Критерии приёмки

- [ ] `npm run cron:expire-invites` завершается 0 при пустой выборке
- [ ] API без секрета → 401
- [ ] Не используется Supabase Edge Function

---

## WIN-008: Тесты

| | |
|---|---|
| **Priority** | High |
| **Complexity** | Moderate |
| **Dependencies** | WIN-001, WIN-004, WIN-006 |
| **Agent** | test-writer |

### Описание

Vitest:

| Файл | Покрытие |
|------|----------|
| `request-finalization.test.ts` | duplicate detection ids, open-status guards, reject validation |
| `expire-invites.test.ts` | expirable matrix, full no_response aggregation |
| `deadline.test.ts` | extend by pause duration |

Интеграционные тесты с реальной БД — **не обязательны** (нет test DB в CI).

### Критерии приёмки

- [ ] `npm test` green
- [ ] Критические ветки F007 из feature doc отражены в кейсах

---

## WIN-009: Канбан — финальные колонки

| | |
|---|---|
| **Priority** | Medium |
| **Complexity** | Simple |
| **Dependencies** | WIN-002, WIN-003 (для ручной проверки) |
| **Agent** | worker |

### Описание

Проверить и при необходимости доработать существующий конфиг (миграция **не нужна**):

- `visibleRequestKanbanColumns(showCompleted)` уже включает `won`, `lost`, `no_response`, `cancelled`.
- Убедиться, что DnD **не** позволяет перетаскивать в/из финальных колонок (`FORBIDDEN_MANUAL_REQUEST_TARGETS`, `allowedRequestDropTargets`).
- После `selectWinner`/`rejectRequest` карточка появляется при включении «Показать завершённые».
- Опционально: preset фильтра «Все статусы» не ломает скрытие финалов по умолчанию.

### Файлы

- `src/lib/kanban-config.ts` (только если найден gap)
- `src/components/kanban/*` (smoke)

### Критерии приёмки

- [ ] `won`/`lost` видны только с `showCompleted` или явным фильтром статуса
- [ ] DnD в `won`/`lost` невозможен

---

## Риски и краевые случаи

| Риск | Митигация |
|------|-----------|
| Partial failure без DB transaction | Порядок операций: сначала request, потом invites, потом task_items, потом duplicates; логировать; при ошибке — явное сообщение, ручной fix |
| Дубль позиции в 3+ запросах | `cancelDuplicateRequests` обходит все открытые, кроме победившего |
| Race: cron expire vs победа | Финальные статусы исключаются из expire; проверка статуса в UPDATE WHERE |
| `reject_reason` на invite vs request | MVP: причина на `requests`; invites только `status` (как в data-model) |

## Критерии приёмки фазы (F007)

- [ ] Через `response_deadline_days` без ответа → invite `no_response`
- [ ] Пустой по ответам запрос после таймера → `no_response` / архив в канбане
- [ ] На уточнении дедлайн не уменьшается (пауза + extend)
- [ ] Победа необратима; проигравшие с одной причиной
- [ ] Победа автозакрывает дубли позиций в других открытых запросах
- [ ] UI: диалоги победы и брака на странице запроса

## Ссылки на код (текущее состояние)

- Блокировка `won`/`lost` вручную: `updateRequestStatus` + `FORBIDDEN_MANUAL_REQUEST_TARGETS` в `kanban-config.ts`
- Пауза без extend: `resumeFromClarification` в `events.ts` (только `timer_paused_at = null`)
- Агрегация `no_response`: `aggregateRequestStatus` в `request-events-helpers.ts`

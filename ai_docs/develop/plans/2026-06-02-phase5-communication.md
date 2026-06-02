# Plan: Фаза 5 — Коммуникация (F006)

**Created:** 2026-06-02  
**Orchestration:** `orch-2026-06-02-phase5-communication`  
**Goal:** Треды и события по паре запрос–поставщик, быстрые сигналы, уточнение с паузой таймера, `response_submitted` при submit  
**Status:** ✅ Complete  
**Total Tasks:** 10  
**Feature doc:** [`F006-threads-and-events.md`](../features/F006-threads-and-events.md)

## Контекст

- **Завершено:** Фазы 0–4. Миграции **001..013** применены.
- **Следующие миграции:** `014_request_events_schema.sql`, `015_request_events_rls.sql`.
- **Применение:** `npm run db:migrate -- supabase/migrations/<file>.sql` (PowerShell: `;` не `&&`).
- **`request_events` отсутствует** — создаём в этой фазе.
- **F004 deferred:** при `submitResponseVersion` — INSERT `response_submitted` (backfill не нужен).
- **Вне scope:** канбан (F005/6), победитель/cron (F007), email notifications (F009), Realtime (опционально — polling 30s достаточно для MVP).

## Архитектурные решения

| Решение | Выбор |
|--------|--------|
| Scope треда | Только `request_supplier_id` (invite). **Нет** чата на уровне `request_id` для поставщиков (F006). |
| Снабженец UI | Отдельный тред **на каждый invite** в карточке запроса (колонка/панель у поставщика в зоне сравнения), не общий чат запроса. |
| Поставщик UI | Тред внизу `/supplier/requests/[inviteId]` под формой ответа. |
| Имена actions | `postRequestMessage`, `postQuickSignal` (вместо generic `postThreadMessage`/`sendSignal` из api/overview — синхронизировать overview после фазы). |
| Статусы / таймер | `requestClarification`: invite + request → `clarification`, `timer_paused_at = now()`. Resume: `resumeFromClarification` (снабженец) или автоматически при `submitResponseVersion` в clarification — `timer_paused_at = null`, invite → `answered`. Продление `deadline_at` на длительность паузы — **минимально**: только снятие паузы (полная формула F007 — Фаза 7). |
| `signal_in_progress` | Event + опционально invite/request → `in_progress` (status-machines: согласованный переход). |
| Обновление invite/request | Как в Phase 4: supplier не UPDATE `request_suppliers` — **admin client** в server actions после проверок. |
| Events immutable | INSERT-only; без UPDATE/DELETE политик. |
| Конкуренты | RLS: supplier SELECT/INSERT только где `supplier_id = current_user_supplier_id()`; procurement через `owns_request(invite.request_id)`. |

## Зависимости (граф)

```
EVT-001 ─→ EVT-002 ─┬─→ EVT-003 ─┬─→ EVT-006 ─┬─→ EVT-007
                    │            │            ├─→ EVT-008
                    ├─→ EVT-004 ─┴─→ EVT-010   └─→ EVT-009
                    └─→ EVT-005 (после EVT-002; схема после EVT-001)
```

## Progress

- ✅ EVT-001: Миграция 014 — схема `request_events`
- ✅ EVT-002: Миграция 015 — RLS events
- ✅ EVT-003: Actions — сообщения и сигналы
- ✅ EVT-004: Actions — уточнение и снятие паузы
- ✅ EVT-005: `submitResponseVersion` + `response_submitted`
- ✅ EVT-006: Lib + компонент `RequestThread`
- ✅ EVT-007: UI тред снабженца (per invite)
- ✅ EVT-008: UI тред поставщика
- ✅ EVT-009: UI быстрые сигналы
- ✅ EVT-010: UI уточнение (снабженец + индикатор паузы)

---

## EVT-001: Миграция 014 — схема `request_events`

| | |
|---|---|
| **Priority** | Critical |
| **Complexity** | Moderate |
| **Dependencies** | None |
| **Agent** | worker |

### Описание

`supabase/migrations/014_request_events_schema.sql`:

**Enum `request_event_type`:**
`message`, `signal_cheaper`, `signal_customer_price`, `signal_in_progress`, `status_change`, `request_updated`, `response_submitted`

**Таблица `request_events`:**
- `id` uuid PK default `gen_random_uuid()`
- `request_supplier_id` uuid NOT NULL FK → `request_suppliers` ON DELETE CASCADE
- `author_id` uuid NOT NULL FK → `profiles`
- `event_type` `request_event_type` NOT NULL
- `payload` jsonb nullable (для `status_change`, `response_submitted`: `{ versionId, versionNumber }`, сигналы: опциональный комментарий)
- `body` text nullable (текст для `message`; опционально для сигналов)
- `created_at` timestamptz NOT NULL DEFAULT now()

**Индексы:**
- `(request_supplier_id, created_at DESC)` — лента
- `(request_supplier_id)` — FK lookups

**RLS:** `ALTER TABLE request_events ENABLE ROW LEVEL SECURITY` (политики — EVT-002).

**Без** триггеров `updated_at` (append-only).

### Файлы

- `supabase/migrations/014_request_events_schema.sql`

### Критерии приёмки

- [ ] Enum и таблица созданы, FK на `request_suppliers` / `profiles`
- [ ] Индекс `(request_supplier_id, created_at)` на месте
- [ ] `npm run db:migrate -- supabase/migrations/014_request_events_schema.sql` без ошибок

---

## EVT-002: Миграция 015 — RLS events

| | |
|---|---|
| **Priority** | Critical |
| **Complexity** | Complex |
| **Dependencies** | EVT-001 |
| **Agent** | worker |

### Описание

`supabase/migrations/015_request_events_rls.sql` по [`auth-rls.md`](../architecture/auth-rls.md):

**Helpers (SECURITY DEFINER, `search_path = ''`):**
- `procurement_owns_invite(p_request_supplier_id uuid)` — `owns_request(rs.request_id)` для строки invite
- `supplier_owns_invite(p_request_supplier_id uuid)` — `rs.supplier_id = current_user_supplier_id()`
- `invite_allows_thread_write(p_request_supplier_id uuid)` — активный invite (`new`, `answered`, `under_review`, `clarification`, `in_progress`) и request не `draft`/`cancelled` (зеркало `invite_allows_supplier_response` + procurement owner)

**Политики `request_events`:**
- **SELECT:** `procurement_owns_invite(id)` OR `supplier_owns_invite(request_supplier_id)` OR `is_admin()`
- **INSERT:** участник пары + `invite_allows_thread_write` + `author_id = auth.uid()`
  - procurement: только типы `message`, `signal_*`, `status_change`, `request_updated` (проверка `event_type` в WITH CHECK или в action — предпочтительно action + RLS на доступ к invite)
  - supplier: только `message`, `response_submitted` (остальное — server actions procurement/admin)
- **UPDATE/DELETE:** нет (или admin DELETE only — не требуется MVP)

**Изоляция:** запрос `request_events` с `request_supplier_id` чужого invite возвращает 0 строк для supplier A.

### Файлы

- `supabase/migrations/015_request_events_rls.sql`

### Критерии приёмки

- [x] Supplier A не видит events invite B на том же `request_id`
- [x] Procurement видит events только своих запросов
- [x] INSERT заблокирован для финальных invite (`lost`, `won`, `no_response`)
- [x] `npm run db:migrate -- supabase/migrations/015_request_events_rls.sql` без ошибок

---

## EVT-003: Server actions — сообщения и быстрые сигналы

| | |
|---|---|
| **Priority** | High |
| **Complexity** | Moderate |
| **Dependencies** | EVT-002 |
| **Agent** | worker |

### Описание

Новый файл `src/actions/events.ts` (или `thread.ts`):

**`postRequestMessage(requestSupplierId, body)`**
- Роли: `procurement` (owns request) | `supplier` (own invite)
- Валидация: непустой trimmed body (max ~4000), invite активен
- INSERT `event_type = 'message'`, `author_id = profile.id`
- `revalidatePath` для `/app/requests/[requestId]`, `/supplier/requests/[inviteId]`

**`postQuickSignal(requestSupplierId, signalType, optionalComment)`**
- Только `procurement`
- `signalType`: `cheaper` | `customer_price` | `in_progress` → `signal_cheaper` | `signal_customer_price` | `signal_in_progress`
- `body` / `payload.comment` — опциональный комментарий
- При `in_progress`: admin client — invite → `in_progress`, request → `in_progress` (если не финал); INSERT `status_change` с payload old/new
- INSERT соответствующего signal event

Типы результата: `{ ok: true } | { ok: false, error: string }` (как `submitResponseVersion`).

### Файлы

- `src/actions/events.ts`

### Критерии приёмки

- [ ] Сообщение сохраняется и видно второй стороне через RLS
- [ ] Сигналы только от снабженца; неверная роль — ошибка
- [ ] `signal_in_progress` переводит статусы (invite + request) по status-machines

---

## EVT-004: Server actions — уточнение и снятие паузы

| | |
|---|---|
| **Priority** | High |
| **Complexity** | Moderate |
| **Dependencies** | EVT-002 |
| **Agent** | worker |

### Описание

В `src/actions/events.ts` или `src/actions/clarification.ts`:

**`requestClarification(requestSupplierId, options?)`**
- Только `procurement`, owns invite
- Invite: status → `clarification`, `timer_paused_at = now()` (admin client)
- Request: status → `clarification` (если не финал)
- Events: `status_change` (payload old/new для invite и request)
- Опционально MVP: `request_updated` с `body` = описание изменений (если передан `changeSummary`); редактирование полей запроса — минимум `comment` через отдельный update или отложить текст-only event

**`resumeFromClarification(requestSupplierId)`**
- `procurement`: явное снятие уточнения без ответа поставщика
- `timer_paused_at = null`; invite → `under_review` или `answered` (если уже есть ответ) — по текущему наличию `first_response_at` / версий
- Request status: пересчёт агрегата (если нет других invite в `clarification` → `has_response` / `awaiting_responses`)
- Event `status_change`

### Файлы

- `src/actions/clarification.ts` (или объединить с `events.ts`)

### Критерии приёмки

- [ ] При уточнении `timer_paused_at` заполнен
- [ ] `resumeFromClarification` очищает паузу
- [ ] Статусы invite/request соответствуют status-machines (минимальный набор переходов)

---

## EVT-005: `submitResponseVersion` — event `response_submitted`

| | |
|---|---|
| **Priority** | High |
| **Complexity** | Simple |
| **Dependencies** | EVT-001, EVT-002 |
| **Agent** | worker |

### Описание

Расширить `src/actions/responses.ts` после успешного insert версии:

1. INSERT `request_events`:
   - `event_type = 'response_submitted'`
   - `author_id = profile.id`
   - `payload = { versionId, versionNumber }`
   - `request_supplier_id = requestSupplierId`

2. Если invite был в `clarification`:
   - admin: `timer_paused_at = null`, статус invite → `answered` (уже делается) — убедиться, что пауза снята
   - при необходимости пересчитать `requests.status` (нет других clarification)

**Не ломать** существующий API `SubmitResponseVersionResult`.

### Файлы

- `src/actions/responses.ts`

### Критерии приёмки

- [ ] После submit в ленте появляется `response_submitted`
- [ ] Ответ в clarification снимает `timer_paused_at`
- [ ] Существующие тесты/flow Phase 4 не регрессируют

---

## EVT-006: Lib + компонент `RequestThread`

| | |
|---|---|
| **Priority** | High |
| **Complexity** | Moderate |
| **Dependencies** | EVT-003 |
| **Agent** | worker |

### Описание

**`src/lib/request-events.ts`:**
- Labels/icons для `request_event_type` (RU)
- `formatEventTime(created_at)` — Europe/Moscow (`ru-RU`)
- `loadEventsForInvite(supabase, requestSupplierId, limit?)` — SELECT ordered by `created_at asc`

**`src/components/threads/request-thread.tsx`:**
- Client component: начальная загрузка props + форма отправки (`postRequestMessage`)
- Лента: автор (имя из profile join или «Снабжение»/«Поставщик»), тип, body, время
- Distinct styling для signals / system / `response_submitted`
- Polling 30s (useEffect + router.refresh или refetch) — без Realtime в MVP

### Файлы

- `src/lib/request-events.ts`
- `src/components/threads/request-thread.tsx`

### Критерии приёмки

- [ ] Лента хронологическая, время в Москве
- [ ] Сигналы визуально отличимы от сообщений

---

## EVT-007: UI тред снабженца (per invite)

| | |
|---|---|
| **Priority** | High |
| **Complexity** | Moderate |
| **Dependencies** | EVT-006 |
| **Agent** | worker |

### Описание

Интеграция в `src/app/app/requests/[id]/page.tsx` и/или `ResponseComparisonTable`:

- Для каждого invite — collapsible **«Переписка»** с `RequestThread` (`requestSupplierId`, `requestId`, role=`procurement`)
- Загрузка events на сервере (parallel per invite или один query `.in('request_supplier_id', ids)`)
- Не показывать единый чат на весь request

### Файлы

- `src/app/app/requests/[id]/page.tsx`
- `src/components/requests/response-comparison-table.tsx` (если удобнее встроить в строку поставщика)

### Критерии приёмки

- [ ] Снабженец видит отдельный тред на каждого поставщика
- [ ] Может отправить текстовое сообщение из UI

---

## EVT-008: UI тред поставщика

| | |
|---|---|
| **Priority** | High |
| **Complexity** | Simple |
| **Dependencies** | EVT-006 |
| **Agent** | worker |

### Описание

`src/app/supplier/requests/[inviteId]/page.tsx`:

- Секция «Переписка» под формой ответа / историей версий
- `RequestThread` с role=`supplier`, read-only если финальный invite
- Server load events для `inviteId`

### Файлы

- `src/app/supplier/requests/[inviteId]/page.tsx`

### Критерии приёмки

- [ ] Поставщик видит сообщения и сигналы снабженца
- [ ] Может ответить сообщением в активном invite

---

## EVT-009: UI быстрые сигналы (снабженец)

| | |
|---|---|
| **Priority** | Medium |
| **Complexity** | Simple |
| **Dependencies** | EVT-003, EVT-007 |
| **Agent** | worker |

### Описание

**`src/components/threads/quick-signals.tsx`:**
- Кнопки: «Есть дешевле», «У заказчика дешевле», «В работе»
- Опциональное поле комментария → `postQuickSignal`
- Разместить рядом с тредом на карточке invite (procurement only)
- Disabled для draft/cancelled request и финальных invite

### Файлы

- `src/components/threads/quick-signals.tsx`
- wiring в EVT-007 layout

### Критерии приёмки

- [ ] Каждый сигнал появляется в ленте с понятной меткой
- [ ] «В работе» обновляет статусы (EVT-003)

---

## EVT-010: UI уточнение (снабженец + индикатор)

| | |
|---|---|
| **Priority** | Medium |
| **Complexity** | Moderate |
| **Dependencies** | EVT-004, EVT-007 |
| **Agent** | worker |

### Описание

**`src/components/threads/clarification-controls.tsx`:**
- Кнопка «Запросить уточнение» → `requestClarification`
- При `invite.status === 'clarification'`: бейдж «Таймер на паузе», кнопка «Снять уточнение» → `resumeFromClarification`
- Показ `timer_paused_at` в UI снабженца (если есть в select invites — добавить поле в query)

Поставщик: на странице invite при `clarification` — информационный баннер «Запрос на уточнении» (без кнопки resume).

### Файлы

- `src/components/threads/clarification-controls.tsx`
- обновить select в `page.tsx` (procurement + supplier) для `timer_paused_at`

### Критерии приёмки

- [ ] Уточнение ставит clarification + паузу
- [ ] Снятие паузы снабженцем работает
- [ ] Ответ поставщика в clarification снимает паузу (EVT-005)

---

## Верификация фазы (test-runner)

1. Два поставщика на одном request — events не пересекаются (manual / RLS smoke).
2. Сообщение procurement → видно supplier и обратно.
3. Три сигнала → три events в ленте.
4. `requestClarification` → `timer_paused_at` NOT NULL; submit ответа → NULL.
5. Submit ответа → `response_submitted` в ленте.

## Не делать (явно)

- Канбан (Фаза 6), `selectWinner` / cron expire (Фаза 7)
- `notifications` / email (F009)
- Realtime subscription (можно TODO в коде)
- `internal_note`, `request_updated` при полном редактировании позиций (только минимальный clarification flow)
- Backfill старых `response_submitted`

## Ссылки

- MVP фаза 5: [`2026-06-01-mvp.md`](2026-06-01-mvp.md)
- [`data-model.md`](../architecture/data-model.md) — `request_events`
- [`status-machines.md`](../architecture/status-machines.md) — clarification, signals
- [`auth-rls.md`](../architecture/auth-rls.md) — events isolation

# Plan: Фаза 4 — Ответ поставщика (F004)

**Created:** 2026-06-02  
**Orchestration:** `orch-2026-06-02-phase4-supplier-responses`  
**Goal:** MVP ответов поставщика — версии, форма, сравнение цен, изоляция конкурентов  
**Status:** 🟢 Ready  
**Total Tasks:** 9  
**Feature doc:** [`F004-supplier-response-variants.md`](../features/F004-supplier-response-variants.md)

## Контекст

- **Завершено:** Фазы 0–3, 2.6. Миграции **001..011** применены.
- **Следующие миграции:** `012_supplier_responses_schema.sql`, `013_supplier_responses_rls.sql`.
- **Применение:** `npm run db:migrate -- supabase/migrations/<file>.sql` (Supabase MCP недоступен).
- **`request_events` нет** — событие `response_submitted` **не пишем** (Фаза 5).
- **`under_review`:** после отправки ответа invite остаётся `answered`; автопереход при «открытии» снабженцем — **вне scope** (Фаза 5/6).

## Архитектурные решения

| Решение | Выбор |
|--------|--------|
| XOR / payment_form | CHECK в БД (012) + валидация в server action + UI |
| Одна `is_current=true` | Partial unique index `(request_supplier_id) WHERE is_current` + flip в транзакции action |
| Статусы invite/request | `submitResponseVersion`: invite `new→answered`; request → `has_response` при первом ответе; `first_response_at` на invite |
| Обновление `request_suppliers` / `requests` поставщиком | RLS 010 запрещает supplier UPDATE invites → **admin client** в action после проверки `supplier_id = current_user_supplier_id()` и активного статуса invite (как cleanup в Phase 3) |
| Сравнение цен | `src/lib/price-compare.ts`, ratio из `app_settings.cash_to_noncash_ratio` |
| Изоляция конкурентов | RLS 013: supplier SELECT только свои версии; procurement SELECT через `owns_request` |

## Зависимости (граф)

```
RSP-001 ─┬─→ RSP-002 ─┬─→ RSP-004 ─┬─→ RSP-006 ─→ RSP-007
         │            │            │
         └─→ RSP-003 ─┴────────────┴─→ RSP-008 (вкл. RSP-009)
                    RSP-002 ─→ RSP-005
```

## Progress

- ⏳ RSP-001: Миграция 012 — схема ответов
- ⏳ RSP-002: Миграция 013 — RLS ответов
- ✅ RSP-003: Модуль `price-compare` + тесты
- ⏳ RSP-004: Server action `submitResponseVersion`
- ✅ RSP-005: ЛК поставщика — список входящих
- ✅ RSP-006: Форма ответа поставщика
- ✅ RSP-007: UI истории версий
- ✅ RSP-008: Сравнительная таблица снабженца
- ✅ RSP-009: Статус invite на карточке запроса (объединено с RSP-008)

---

## RSP-001: Миграция 012 — схема ответов

| | |
|---|---|
| **Priority** | Critical |
| **Complexity** | Moderate |
| **Dependencies** | None |
| **Agent** | worker |

### Описание

Создать `supabase/migrations/012_supplier_responses_schema.sql`:

**`supplier_response_versions`**
- `id` uuid PK, `request_supplier_id` uuid FK → `request_suppliers` ON DELETE CASCADE
- `version_number` int NOT NULL, `is_current` boolean NOT NULL DEFAULT false
- `comment` text, `submitted_at` timestamptz NOT NULL DEFAULT now()
- `created_by` uuid FK → `profiles`
- UNIQUE `(request_supplier_id, version_number)`
- Partial unique: `UNIQUE (request_supplier_id) WHERE is_current = true`
- Индексы: `(request_supplier_id)`, `(request_supplier_id, is_current)`

**`response_line_items`**
- `id` uuid PK, `version_id` FK → `supplier_response_versions` ON DELETE CASCADE
- `request_item_id` FK → `request_items`
- Цены: `price_with_vat`, `price_cash`, `price_without_vat` numeric nullable CHECK (>= 0)
- Доставка: `delivery_price` numeric nullable, `price_includes_delivery` boolean DEFAULT false
- Наличие: `in_stock` boolean nullable, `lead_time_days` int nullable CHECK (lead_time_days > 0)
- `line_comment` text
- UNIQUE `(version_id, request_item_id)`
- CHECK XOR (data-model.md):
  - `NOT (in_stock IS NOT NULL AND lead_time_days IS NOT NULL)`
  - `NOT (delivery_price IS NOT NULL AND price_includes_delivery = true)`
- Индексы: `(version_id)`, `(request_item_id)`

**RLS:** `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` (политики — RSP-002).

**Триггеры:** `updated_at` не требуется (версии immutable после submit); опционально `BEFORE INSERT` на versions для auto `version_number` — предпочтительно явно в action.

### Файлы

- `supabase/migrations/012_supplier_responses_schema.sql`

### Критерии приёмки

- [ ] Таблицы созданы, FK и индексы на месте
- [ ] CHECK XOR срабатывает при нарушении
- [ ] Не более одной `is_current=true` на invite (partial unique)
- [ ] `npm run db:migrate -- supabase/migrations/012_supplier_responses_schema.sql` без ошибок

---

## RSP-002: Миграция 013 — RLS ответов

| | |
|---|---|
| **Priority** | Critical |
| **Complexity** | Complex |
| **Dependencies** | RSP-001 |
| **Agent** | worker |

### Описание

`supabase/migrations/013_supplier_responses_rls.sql` по [`auth-rls.md`](../architecture/auth-rls.md):

**Helpers (SECURITY DEFINER, `search_path = ''`):**
- `invite_allows_supplier_response(p_request_supplier_id uuid)` — invite принадлежит `current_user_supplier_id()`, request не `draft`/`cancelled`, invite status IN (`new`, `answered`, `under_review`, `clarification`, `in_progress`)
- `owns_request_supplier_via_request(p_version_id uuid)` — procurement: version → invite → request → `owns_request`
- `supplier_owns_version(p_version_id uuid)` — version → invite → supplier match

**`supplier_response_versions`**
- SELECT: procurement `owns_request` через invite; supplier только свои (`supplier_id` на invite)
- INSERT: supplier + `invite_allows_supplier_response`
- UPDATE: supplier только свои, те же условия (для `is_current` flip при новой версии — или только через action + admin; минимум: запрет UPDATE чужих)
- Блок: финальные invite (`lost`, `won`, `no_response`) и `requests.status = cancelled`

**`response_line_items`**
- SELECT: через version, те же правила
- INSERT: вместе с версией, supplier + active invite
- UPDATE/DELETE: по необходимости запретить (immutable lines) или только owner insert path

**Не расширять** UPDATE на `request_suppliers` для supplier в этой миграции — статусы invite обновляет server action через admin client (см. RSP-004).

### Файлы

- `supabase/migrations/013_supplier_responses_rls.sql`

### Критерии приёмки

- [ ] Поставщик A не видит версии/строки поставщика B на том же запросе
- [ ] INSERT отклоняется при invite `lost`/`won`/`no_response` или request `cancelled`
- [ ] Procurement видит все ответы **своих** запросов
- [ ] Идемпотентность: DROP POLICY IF EXISTS + CREATE OR REPLACE helpers

---

## RSP-003: Модуль сравнения цен

| | |
|---|---|
| **Priority** | High |
| **Complexity** | Simple |
| **Dependencies** | None (параллельно после RSP-001) |
| **Agent** | worker → test-writer |

### Описание

`src/lib/price-compare.ts`:
- `loadCashToNoncashRatio(supabase)` или принимать ratio как аргумент (для тестов)
- `minComparablePrice(line, ratio)` — min среди заполненных: `price_without_vat`, `price_with_vat`, `price_cash / ratio`
- `isBestPriceAmongSuppliers(linePrices: number[])` / `findBestPriceIndex` для подсветки ячейки
- Типы для line snapshot (nullable prices)

`src/lib/price-compare.test.ts`: ratio 0.84, cash vs non-cash, nulls, tie.

### Файлы

- `src/lib/price-compare.ts`
- `src/lib/price-compare.test.ts`

### Критерии приёмки

- [ ] Формула совпадает с F004 / data-model.md
- [ ] `npm run test` — новые тесты зелёные

---

## RSP-004: Server action `submitResponseVersion`

| | |
|---|---|
| **Priority** | Critical |
| **Complexity** | Complex |
| **Dependencies** | RSP-001, RSP-002 |
| **Agent** | worker |

### Описание

`src/actions/responses.ts`:

```ts
export type SubmitResponseVersionResult =
  | { ok: true; versionId: string; versionNumber: number }
  | { ok: false; error: string };
```

**Вход:** `requestSupplierId`, `comment?`, `lines: Array<{ requestItemId, prices..., delivery..., inStock | leadTimeDays, lineComment? }>`.

**Валидация (server):**
- Роль `supplier`, `profile.supplier_id` совпадает с invite
- Invite в активном статусе; request sent, не cancelled
- Все `request_item_id` принадлежат request invite
- XOR stock/lead, XOR delivery, `payment_form`: `non_cash` → reject `price_cash`
- `needs_delivery=false` → delivery fields null/false
- Хотя бы одна цена или stock/lead на строке (уточнить: пустые строки skip vs error — **ошибка если ни одной заполненной строки**)

**Транзакция (порядок):**
1. `createClient`: прочитать invite + request + items (RLS)
2. Вычислить `version_number = max+1`
3. INSERT version + lines (`createClient`, RLS)
4. UPDATE предыдущие versions `is_current=false` (same invite)
5. **`createAdminClient`:** invite `status='answered'`, `first_response_at=coalesce(first_response_at, now())`
6. **Admin:** если первый ответ по запросу — `requests.status='has_response'` (если был `awaiting_responses` или `new`)
7. `revalidatePath('/supplier')`, `revalidatePath('/supplier/requests/...')`, `revalidatePath('/app/requests/[id]')`

**НЕ делать:** INSERT в `request_events`.

### Файлы

- `src/actions/responses.ts` (новый)

### Критерии приёмки

- [ ] Вторая версия: v1 `is_current=false`, v2 `is_current=true`
- [ ] Invite → `answered`, request → `has_response` при первом ответе
- [ ] Нарушение XOR/payment_form → `{ ok: false, error }`
- [ ] Конкурент не может submit чужой invite

---

## RSP-005: ЛК поставщика — список входящих

| | |
|---|---|
| **Priority** | High |
| **Complexity** | Moderate |
| **Dependencies** | RSP-002 |
| **Agent** | worker |

### Описание

Заменить заглушку `src/app/supplier/page.tsx` (или `src/app/supplier/requests/page.tsx` + redirect):

- Server Component, `createClient`
- Query `request_suppliers` + join `requests` (`request_code`, `sent_at`, `payment_form`, `needs_delivery`) + optional hint текущей версии (`is_current` exists)
- Колонки: код запроса, статус invite (`requestSupplierStatusPresentation`), дедлайн (`describeDeadline`), дата отправки
- Ссылка: `/supplier/requests/[inviteId]` где `inviteId` = `request_suppliers.id`
- Фильтр: только sent requests; сортировка по `deadline_at`
- Пустое состояние

### Файлы

- `src/app/supplier/page.tsx`
- `src/components/supplier/supplier-invite-list.tsx` (новый, опционально)
- `src/lib/request-status.ts` (reuse)

### Критерии приёмки

- [ ] Поставщик видит только свои invites (RLS)
- [ ] Клик ведёт на форму ответа
- [ ] Дедлайн и статус отображаются корректно

---

## RSP-006: Форма ответа поставщика

| | |
|---|---|
| **Priority** | Critical |
| **Complexity** | Complex |
| **Dependencies** | RSP-004, RSP-005 |
| **Agent** | worker |

### Описание

`src/app/supplier/requests/[inviteId]/page.tsx` + `src/components/supplier/response-form.tsx`:

- Загрузка invite, request (`payment_form`, `needs_delivery`), `request_items`, существующие versions (для подсказки номера)
- Таблица строк: name, qty, unit
- Поля цены: до 3 колонок по `payment_form` (скрыть cash при `non_cash`)
- Доставка: показать только если `needs_delivery`; radio/checkbox «цена с доставкой» XOR поле суммы
- Stock: checkbox «в наличии» XOR input «срок, дней»
- `comment` на уровне версии
- Client validation зеркалит server (XOR, payment_form)
- Submit → `submitResponseVersion`; toast/redirect на список
- Блокировка submit если invite финальный

### Файлы

- `src/app/supplier/requests/[inviteId]/page.tsx`
- `src/components/supplier/response-form.tsx`

### Критерии приёмки

- [ ] Успешный submit создаёт версию 1
- [ ] Повторный submit с той же формы → версия 2 (отдельная кнопка «Отправить новую версию» или всегда new version)
- [ ] UI не показывает cash при `non_cash`

---

## RSP-007: UI истории версий

| | |
|---|---|
| **Priority** | Medium |
| **Complexity** | Moderate |
| **Dependencies** | RSP-006 |
| **Agent** | worker |

### Описание

`src/components/responses/version-history.tsx` (shared):

- Props: versions[] ordered by `version_number` desc, lines grouped by version
- Accordion/collapse: vN, `submitted_at`, badge **«Актуальная»** если `is_current`
- Использовать на:
  - `/supplier/requests/[inviteId]` — под формой
  - `/app/requests/[id]` — внутри ячейки сравнения или боковой панели invite

### Файлы

- `src/components/responses/version-history.tsx`

### Критерии приёмки

- [ ] Видны все версии; текущая помечена
- [ ] Снабженец видит историю по каждому поставщику на своём запросе

---

## RSP-008: Сравнительная таблица снабженца (+ RSP-009)

| | |
|---|---|
| **Priority** | High |
| **Complexity** | Complex |
| **Dependencies** | RSP-003, RSP-004, RSP-007 |
| **Agent** | worker |

### Описание

На `src/app/app/requests/[id]/page.tsx` — секция **«Сравнение ответов»**:

- Строки = `request_items` (sort_order)
- Колонки = invites этого request (имя поставщика)
- Ячейка = текущая версия (`is_current`): показать min comparable + все заполненные варианты (tooltip/secondary text)
- Подсветка лучшей цены по строке (`price-compare`)
- Раскрытие истории (`version-history`) per cell/supplier
- **RSP-009 (встроено):** блок `SupplierInvites` уже показывает статус — после ответа badge «Дан ответ» подтянется автоматически при revalidate; убедиться что данные refetch после submit (без отдельной задачи если достаточно revalidate)

Query: versions + line_items для всех invites request (procurement RLS).

### Файлы

- `src/components/requests/response-comparison-table.tsx` (новый)
- `src/app/app/requests/[id]/page.tsx` (интеграция)

### Критерии приёмки

- [ ] Таблица только для invites этого request
- [ ] Лучшая цена по строке подсвечена
- [ ] Поставщик без ответа — пустая ячейка / «—»
- [ ] Invite list показывает `answered` после ответа

---

## Верификация (финал цикла)

| Проверка | Команда / действие |
|----------|-------------------|
| Миграции | `npm run db:migrate -- ...012...` ; `...013...` |
| Тесты | `npm run test` |
| Lint | `npm run lint` |
| Build | `npm run build` |
| Ручной E2E | procurement send → supplier login → submit v1 → procurement comparison → supplier v2 → history |

## Вне scope (явно)

- `request_events`, тред, `response_submitted` event (Фаза 5)
- Канбан, фильтры (Фаза 6)
- `under_review` при просмотре снабженцем
- Выбор победителя, cron, `no_response` automation (Фаза 7)

## Ссылки

- MVP: [`2026-06-01-mvp.md`](2026-06-01-mvp.md) § Фаза 4
- Phase 3 report: [`2026-06-02-phase3-requests-report.md`](../reports/2026-06-02-phase3-requests-report.md)
- Data model: [`data-model.md`](../architecture/data-model.md)
- Status: [`status-machines.md`](../architecture/status-machines.md)
- RLS: [`auth-rls.md`](../architecture/auth-rls.md)

# Plan: Фаза 6 — Канбан и фильтры (F005)

**Created:** 2026-06-02  
**Orchestration:** `orch-2026-06-02-phase6-kanban-filters`  
**Goal:** Канбан задач/запросов (снабженец), канбан invites (поставщик), таблица запросов, общие фильтры и ручная смена статуса запроса (без победителя/cron)  
**Status:** 🟢 Ready  
**Total Tasks:** 9  
**Feature doc:** [`F005-kanban-and-filters.md`](../features/F005-kanban-and-filters.md)  
**UX:** [`kanban-and-filters-ux.md`](../../design/kanban-and-filters-ux.md)

## Контекст

- **Завершено:** Фазы 0–5. Миграции **001..015** применены.
- **Новые миграции:** **не требуются** (016+ только при необходимости; фаза — UI + server action статусов).
- **Есть:** `/app` (список задач), `/app/requests` (список + простой status select), `/app/table` (заглушка), `/supplier` (список active/completed), `request-status.ts`, `request-events-helpers.aggregateRequestStatus`, events/signals (F006).
- **Nav:** `PROCUREMENT_NAV` = Задачи | Запросы | Таблица.
- **Вне scope:** Phase 7 (`won`/`lost`/победитель/cron), сохранённые пресеты фильтров, drag задач (optional — не делать), email/realtime.

## Архитектурные решения

| Решение | Выбор |
|--------|--------|
| Колонки | Единый источник `src/lib/kanban-config.ts`: requests, tasks, supplier invites; `visible` / `hidden` (won, lost, no_response, cancelled). |
| Дефолт фильтра | Группа **«Запрос в работе»** = `new`, `awaiting_responses`, `has_response`, `clarification`, `in_progress` (без финалов). Константа + preset в `request-filters`. |
| Ручной статус запроса | `updateRequestStatus(requestId, targetStatus)` в `src/actions/requests.ts` (или отдельный файл). **Запрещено:** `won`, `lost` (Phase 7). **Разрешено DnD/меню:** переходы между *рабочими* колонками + явный `in_progress`; `cancelled` — только если уже есть action/правило (иначе не в MVP). |
| Проверки | `getProfile` + `owns_request` через user client; UPDATE `requests` через **admin client** после проверки (как Phase 4–5). `status_change` event при смене. |
| Агрегация vs колонка | Канбан группирует по `requests.status` (не пересчитывает из invites на клиенте). Авто-переходы по ответам уже в actions — DnD только для разрешённых ручных целей. |
| Фильтры | Общий `RequestFilters` + `RequestFilterState` (даты, multiselect статусов, категория, bitrix, поставщик, showCompleted). MVP: **client-side** на массиве с сервера (как `RequestList`); опционально sync в `?view=` / `?status=` для shareable URL — без блокера. |
| List / Kanban | `/app/requests`: toggle `list` \| `kanban` (localStorage `zapros-requests-view`); list рефакторится на общие фильтры. |
| DnD | Добавить `@dnd-kit/core` + `@dnd-kit/utilities` (лёгкий, a11y). Альтернатива «Переместить в…» в меню карточки — обязательна по UX. |
| Задачи | Колонки по `tasks.status` (`active`, `partially_closed`, `completed`, `archived`); **без drag**; карточки с счётчиком запросов (как `TaskList`). |
| Поставщик | Колонки по `request_suppliers.status`; скрытые `lost`, `no_response` по умолчанию; горизонтальный скролл + фильтры в **drawer** на mobile. |
| Таблица | Те же `RequestListItem`-поля + колонки сортировки (код, задача, статус, пост., дата, дедлайн); те же фильтры что канбан. |
| RLS | Без изменений схемы; снабженец видит только свои запросы/задачи (существующие политики). |

### Матрица ручных переходов запроса (Phase 6)

Источник: `status-machines.md`. DnD и `updateRequestStatus` принимают только `targetStatus` из этой матрицы:

| Из \\ В | `new` | `awaiting_responses` | `has_response` | `clarification` | `in_progress` |
|---------|-------|----------------------|----------------|----------------|---------------|
| `new` | — | ✓ | ✓ | ✓ | ✓ |
| `awaiting_responses` | ✓ | — | ✓ | ✓ | ✓ |
| `has_response` | ✓ | ✓ | — | ✓ | ✓ |
| `clarification` | ✓ | ✓ | ✓ | — | ✓ |
| `in_progress` | ✓ | ✓ | ✓ | ✓ | — |

**Запрещено в Phase 6:** `draft`, `won`, `lost`, `no_response`, `cancelled` как цель DnD. Черновики (`draft`) не показывать на доске (только sent requests, как в списке).

При смене на `in_progress` — по аналогии с `postQuickSignal(signal_in_progress)`: обновить request + активные invites (reuse helper из `events.ts` / вынести в `request-status-actions.ts`).

## Зависимости (граф)

```
KBN-001 ─→ KBN-002 ─┬─→ KBN-003 ─┬─→ KBN-005 ─→ KBN-008
                    │            │
                    └─→ KBN-004 ─┴─→ KBN-006
                                 └─→ KBN-007

KBN-009 (тесты) — после KBN-001, KBN-002
```

**Параллельно после KBN-004:** KBN-005, KBN-006, KBN-007 (разные страницы).

## Progress

- ✅ KBN-001: Конфиг канбана и пресеты фильтров
- ✅ KBN-002: Server action `updateRequestStatus`
- ✅ KBN-003: Компонент `request-filters.tsx`
- ✅ KBN-004: Общие компоненты канбана + DnD
- ✅ KBN-005: Канбан запросов `/app/requests` + list/kanban toggle
- ✅ KBN-006: Канбан задач `/app`
- ✅ KBN-007: Канбан поставщика `/supplier`
- ✅ KBN-008: Таблица `/app/table`
- ⏳ KBN-009: Тесты конфига и переходов статуса

---

## KBN-001: Конфиг канбана и пресеты фильтров

| | |
|---|---|
| **Priority** | Critical |
| **Complexity** | Moderate |
| **Dependencies** | None |
| **Agent** | worker |

### Описание

`src/lib/kanban-config.ts`:

- **`REQUEST_KANBAN_COLUMNS`**: id, `status` (один или массив для колонки), `label`, `visibleDefault`, `variant` (для заголовка колонки).
- Visible: `new`, `awaiting_responses`, `has_response`, `clarification`, `in_progress`.
- Hidden group: `lost`, `won`, `no_response`, `cancelled` (+ опционально `draft` исключён из доски).
- **`TASK_KANBAN_COLUMNS`**: `active`, `partially_closed`, `completed`, `archived`.
- **`SUPPLIER_KANBAN_COLUMNS`**: invite statuses; hidden: `lost`, `no_response`; `won` не колонка у проигравших (как lost).
- **`REQUEST_FILTER_PRESET_IN_WORK`**: статусы дефолтной группы «Запрос в работе».
- **`isManualRequestTransition(from, to)`**, **`allowedRequestDropTargets(from)`** — для action и DnD.
- **`filterRequestByState(item, filters, showCompleted)`** — pure helper (типы рядом или в `request-filter-types.ts`).

Переиспользовать лейблы из `request-status.ts` где возможно.

### Файлы

- `src/lib/kanban-config.ts`
- (опционально) `src/lib/request-filter-types.ts`

### Критерии приёмки

- [ ] Единый список колонок для трёх досок
- [ ] Дефолт скрывает `lost`/`won`/`no_response`/`cancelled`
- [ ] Пресет «Запрос в работе» экспортирован и используется как initial state фильтров

---

## KBN-002: Server action `updateRequestStatus`

| | |
|---|---|
| **Priority** | Critical |
| **Complexity** | Complex |
| **Dependencies** | KBN-001 |
| **Agent** | worker |

### Описание

`updateRequestStatus(requestId: string, targetStatus: RequestStatus)` в `src/actions/requests.ts`:

1. Auth: `procurement` \| `admin`.
2. Load request (user client, RLS) — `id`, `status`, `created_by`.
3. Validate `isManualRequestTransition(current, target)`.
4. Reject `won`, `lost`, `no_response`, `cancelled`, `draft`.
5. Admin client UPDATE `requests.status`.
6. При `in_progress`: синхронизировать invites (как `postQuickSignal` / extract shared `applyInProgressToInvites`).
7. INSERT `request_events` `status_change` на затронутые invites (или один aggregate event — по паттерну Phase 5).
8. `revalidatePath`: `/app/requests`, `/app/table`, `/app/requests/[id]`.

**Не делать:** выбор победителя, `lost` с `reject_reason`, cron.

### Файлы

- `src/actions/requests.ts` (расширение)
- (опционально) `src/lib/request-status-actions.ts` — shared invite sync

### Критерии приёмки

- [ ] Неразрешённый переход → `{ ok: false, error }`
- [ ] Чужой запрос → ошибка доступа
- [ ] Успешный переход обновляет UI после revalidate
- [ ] `won`/`lost` отклоняются явным сообщением

---

## KBN-003: Компонент `request-filters.tsx`

| | |
|---|---|
| **Priority** | High |
| **Complexity** | Moderate |
| **Dependencies** | KBN-001 |
| **Agent** | worker |

### Описание

`src/components/filters/request-filters.tsx` (client):

- Controlled `RequestFilterState`: created range, completed range (optional MVP: только created), status multiselect, category, bitrix number, supplier multiselect, stage preset dropdown (**«Запрос в работе»** default).
- Кнопки: **Применить**, **Сбросить** (возврат к preset in-work + hide completed).
- Toggle **«Показать завершённые»** → включает hidden statuses в фильтр/отображение.
- Desktop: панель над доской; mobile: **Sheet/Drawer** справа (см. UX doc).
- Экспорт `defaultRequestFilters()`, `applyPresetInWork()`.

Загрузка опций поставщиков/категорий: props с сервера (`distinct` из видимых запросов) или упрощённо — ids из joined data на странице.

### Файлы

- `src/components/filters/request-filters.tsx`

### Критерии приёмки

- [ ] Сброс восстанавливает пресет «Запрос в работе» и скрывает финалы
- [ ] Multiselect статусов работает с kanban-config labels
- [ ] Drawer на узком viewport

---

## KBN-004: Общие компоненты канбана + DnD

| | |
|---|---|
| **Priority** | High |
| **Complexity** | Complex |
| **Dependencies** | KBN-001, KBN-002 |
| **Agent** | worker |

### Описание

Зависимость: `npm install @dnd-kit/core @dnd-kit/utilities`.

`src/components/kanban/`:

- **`kanban-board.tsx`**: горизонтальный скролл колонок, responsive.
- **`kanban-column.tsx`**: заголовок, счётчик, drop zone.
- **`kanban-card.tsx`**: слот для children; link на детальную карточку.
- **`use-request-kanban-dnd.ts`**: onDragEnd → `updateRequestStatus` если целевая колонка разрешена; optimistic UI optional.
- **Меню «Переместить в…»** на карточке запроса (a11y fallback).

Props generic: `columns`, `itemsByColumn`, `getColumnId(item)`, `onMove?`, `readOnly?` (supplier board — read-only drag off).

### Файлы

- `src/components/kanban/*`
- `package.json` / `package-lock.json`

### Критерии приёмки

- [ ] DnD только в разрешённые колонки (KBN-001)
- [ ] Keyboard/menu alternative без drag
- [ ] Горизонтальный скролл на mobile

---

## KBN-005: Канбан запросов `/app/requests` + list/kanban toggle

| | |
|---|---|
| **Priority** | High |
| **Complexity** | Complex |
| **Dependencies** | KBN-003, KBN-004 |
| **Agent** | worker |

### Описание

- `src/components/requests/request-kanban.tsx` — карточка: код, задача №, статус badge, пост., deadline badge.
- Обновить `src/app/app/requests/page.tsx`: расширить select (категория задачи, supplier ids для filter options); передать items в client wrapper.
- `src/components/requests/requests-view.tsx`: toggle List | Kanban; `RequestFilters` + `RequestList` \| `RequestKanban`.
- Рефактор `request-list.tsx`: убрать встроенный простой status `<Select>`, использовать `RequestFilters`.
- Пустые колонки: подсказка из UX.
- `showCompleted` добавляет hidden-колонки в kanban.

### Файлы

- `src/app/app/requests/page.tsx`
- `src/components/requests/request-kanban.tsx`
- `src/components/requests/requests-view.tsx`
- `src/components/requests/request-list.tsx` (рефактор)

### Критерии приёмки

- [ ] По умолчанию не видны won/lost/no_response/cancelled
- [ ] Toggle list/kanban сохраняется в session/localStorage
- [ ] DnD меняет статус через KBN-002
- [ ] List и kanban показывают один и тот же отфильтрованный набор

---

## KBN-006: Канбан задач `/app`

| | |
|---|---|
| **Priority** | Medium |
| **Complexity** | Moderate |
| **Dependencies** | KBN-004 |
| **Agent** | worker |

### Описание

- `src/components/tasks/task-kanban.tsx` — колонки из `TASK_KANBAN_COLUMNS`; карточка: № Bitrix, title, category, `RequestCounter`, status badge.
- `src/components/tasks/tasks-view.tsx` или расширить `task-list.tsx`: поиск сохранить; опционально toggle list/kanban (default list OK per F005).
- `src/app/app/page.tsx` — передать данные в view.
- **Без drag** задач.

### Файлы

- `src/components/tasks/task-kanban.tsx`
- `src/app/app/page.tsx`
- `src/components/tasks/task-list.tsx` (интеграция toggle)

### Критерии приёмки

- [ ] 4 колонки по статусу задачи
- [ ] Счётчик запросов на карточке
- [ ] Empty state «Создать из Bitrix» сохранён

---

## KBN-007: Канбан поставщика `/supplier`

| | |
|---|---|
| **Priority** | High |
| **Complexity** | Moderate |
| **Dependencies** | KBN-004 |
| **Agent** | worker |

### Описание

- `src/components/supplier/supplier-kanban.tsx` — колонки invite status; карточка: Bitrix №, `request_code`, deadline, badge.
- Заменить или дополнить `supplier-request-list.tsx`: kanban default, list optional compact.
- `src/app/supplier/page.tsx` — map invites в колонки; `readOnly` kanban (поставщик не двигает статус запроса).
- Mobile: фильтры в drawer; touch-friendly card min-height.
- «Показать завершённые» → колонки `lost`, `no_response`.

### Файлы

- `src/components/supplier/supplier-kanban.tsx`
- `src/app/supplier/page.tsx`
- `src/components/supplier/supplier-request-list.tsx` (рефактор или deprecate list-only)

### Критерии приёмки

- [ ] Только invites текущего поставщика (RLS)
- [ ] Скрытые финалы по умолчанию
- [ ] Удобно на узком экране (scroll + drawer)

---

## KBN-008: Таблица `/app/table`

| | |
|---|---|
| **Priority** | High |
| **Complexity** | Moderate |
| **Dependencies** | KBN-003, KBN-005 (shared filter state / types) |
| **Agent** | worker |

### Описание

- Заменить `SectionStub` на полноценную страницу.
- `src/components/requests/request-table.tsx` — `<table>` / responsive card-rows; сортировка по клику заголовка (client): код, задача, статус, пост., sentAt, deadline.
- `src/app/app/table/page.tsx` — тот же query что `/app/requests` (+ поля для category, suppliers); `RequestFilters` + `RequestTable`.
- Ссылка на строку → `/app/requests/[id]`.

### Файлы

- `src/app/app/table/page.tsx`
- `src/components/requests/request-table.tsx`

### Критерии приёмки

- [ ] Те же фильтры и дефолт «Запрос в работе», что канбан
- [ ] Сортировка хотя бы по дате отправки и коду
- [ ] Нет дублирования логики фильтрации (shared helper из KBN-001)

---

## KBN-009: Тесты конфига и переходов статуса

| | |
|---|---|
| **Priority** | Medium |
| **Complexity** | Simple |
| **Dependencies** | KBN-001, KBN-002 |
| **Agent** | test-writer |

### Описание

Vitest:

- `kanban-config.test.ts`: visible/hidden columns, preset in-work statuses, `isManualRequestTransition` matrix, запрет целей `won`/`lost`.
- (опционально) unit-test pure `filterRequestByState` с fixture rows.

Интеграционный тест action — только если уже есть pattern с mocked supabase; иначе ограничиться pure functions.

### Файлы

- `src/lib/kanban-config.test.ts`

### Критерии приёмки

- [ ] `npm run test` green
- [ ] Покрыты граничные запрещённые переходы

---

## Риски и заметки

| Риск | Митигация |
|------|-----------|
| DnD vs серверная агрегация статуса | После ответа поставщика статус может откатить ручной — document; в Phase 7 уточнить |
| Большой объём на клиенте | MVP ок; позже server-side filter в query |
| Дублирование с `aggregateRequestStatus` | Ручной DnD пишет явный `requests.status`; не вызывать aggregate поверх |
| Нет dnd-kit в проекте | KBN-004 добавляет зависимость |

## Верификация фазы (ручная)

1. `/app/requests` — kanban, дефолт без финалов, «Показать завершённые», DnD `has_response` → `in_progress`.
2. `/app/requests` — list toggle, те же фильтры.
3. `/app` — kanban задач, счётчики.
4. `/supplier` — kanban на телефоне, drawer фильтров.
5. `/app/table` — те же записи что kanban после Apply.
6. Попытка DnD в «Завершён (победа)» — запрещено / колонка скрыта.

## Ссылки

- [`status-machines.md`](../architecture/status-machines.md)
- [`src/lib/request-status.ts`](../../../src/lib/request-status.ts)
- Phase 5 plan: [`2026-06-02-phase5-communication.md`](./2026-06-02-phase5-communication.md)

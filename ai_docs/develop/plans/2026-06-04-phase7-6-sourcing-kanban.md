# Plan: Фаза 7.6 — Канбан проработки + Admin View As (F010)

**Created:** 2026-06-04  
**Orchestration:** `orch-2026-06-04-phase7-6-sourcing`  
**Goal:** Канбан поставщиков на `/sourcing` (8 колонок, матрица переходов A) и admin-доступ к доскам с опциональным «Просмотр от лица» (reads + writes под impersonated user id)  
**Status:** ✅ Completed (2026-06-04)  
**Total Tasks:** 8  
**Feature doc:** [`F010-supplier-sourcing.md`](../features/F010-supplier-sourcing.md)

## Контекст

- **Завершено:** Фазы 0–7.5 (кроме уведомлений 7.5 — вне scope). Groundwork F010: enum `supplier_sourcing_status`, RLS `is_senior_or_admin()`, триггер `works_in_zapros`, admin CRUD в `admin-catalog.ts`, заглушка `/sourcing`.
- **Новые миграции:** **не требуются** (логика воронки и триггер уже в 006–008).
- **Есть:** `src/lib/sourcing.ts` (статусы, лейблы, `deriveWorksInZapros`), `KanbanBoard` + `useRequestKanbanDnd` (`@dnd-kit`), `createClient()` → `session.userId` для RLS, `withDbSession(userId)`, `createUser` в `admin-users.ts`.
- **Нет:** view-as, `sourcing-kanban-config`, actions/UI для `/sourcing`, admin-ссылок на доски.
- **Вне scope:** Phase 7.5 notifications, 7.7 EAV/warehouses, audit log impersonation.

## Спецификация (утверждена)

### Канбан `/sourcing`

| Параметр | Значение |
|----------|----------|
| Колонки | 8 = все `SOURCING_STATUSES` из `src/lib/sourcing.ts` |
| Матрица **A (воронка)** | ±1 по цепочке `new → … → working_in_zapros`; любой не-`rejected` → `rejected`; `rejected` → только `new` |
| Обязательные поля | Нет (MVP) |
| Primary user | `senior_procurement`; layout остаётся `/sourcing` |
| Создание карточки | На `/sourcing`: имя + опциональные контакты; старт `new` |
| `works_in_zapros` | Только из стадии (`deriveWorksInZapros` + DB trigger) |
| `working_in_zapros` | Если нет активного `profiles` с `role=supplier`, `supplier_id`, `is_active` → модал провижининга (email с карточки, пароль ≥8); блок без email |

### Admin testing access

| Параметр | Значение |
|----------|----------|
| Sidebar | «Просмотр досок»: `/sourcing`, `/app`, `/supplier` |
| Layout guards | `admin` допускается на эти сегменты (не только role-specific) |
| View As | `ENABLE_ADMIN_VIEW_AS` (default `true`); httpOnly cookie → effective user id |
| DB/RLS | **Reads и writes** через `createClient` / `withDbSession` с id выбранного пользователя |
| UI | Баннер «Просмотр от лица: …» + сброс; picker: active users по ролям; supplier → обязателен `supplier_id` |
| Без view-as | Admin по-прежнему full access через `is_admin()` |
| Future | `ENABLE_ADMIN_VIEW_AS=false` → скрыть picker и ссылки на доски |

## Архитектурные решения

| Решение | Выбор |
|--------|--------|
| Конфиг воронки | Отдельный `src/lib/sourcing-kanban-config.ts` (не смешивать с `kanban-config.ts` для запросов) |
| DnD | Паттерн `useRequestKanbanDnd` → `useSourcingKanbanDnd`; общие `KanbanBoard`, `KanbanColumn`, `KanbanCard` |
| Server actions | Новый `src/actions/sourcing.ts`: `updateSupplierSourcingStatus`, `createSourcingSupplier`, `provisionSupplierUser` |
| Авторизация actions | `senior_procurement` **или** admin (при view-as — effective role через RLS) |
| View-as cookie | Имя вроде `zapros_view_as_user_id`; httpOnly, secure в production; только admin может set/clear |
| Effective user | `getSessionUserId()` + `getViewAsUserId()` → `getEffectiveDbUserId()`; `getEffectiveProfile()` для UI |
| `createClient` | `createDataClient(await getEffectiveDbUserId())` |
| `getProfile` vs effective | Сохранить `getProfile()` = реальный пользователь сессии; добавить `getEffectiveProfile()` для досок и actions |
| Провижининг | Переиспользовать `createAuthUser` + insert `profiles` из `admin-users.ts` (роль `supplier`, `supplier_id`) |
| Revalidate | `/sourcing`, `/admin/suppliers`, `/admin/users` после мутаций |

### Матрица переходов A (канбан)

Цепочка (индексы 0..6): `new`, `called`, `clarified`, `got_price`, `test_order`, `approved`, `working_in_zapros`.

```
allowed(from, to):
  if from === to → false
  if to === 'rejected' && from !== 'rejected' → true
  if from === 'rejected' && to === 'new' → true
  if from === 'rejected' || to === 'rejected' → false (except above)
  if index(to) === index(from) ± 1 → true
  else → false
```

## Зависимости (граф)

```
VIEWAS-001 ──┬──→ SRC-004 ──→ SRC-005 ──→ SRC-006 ──┐
             │                                      ├──→ INT-008
ADMIN-002 ───┼──→ VIEWAS-007 ───────────────────────┘
             │
SRC-003 ─────┴──→ SRC-004
```

**Параллельно в начале:** `VIEWAS-001`, `ADMIN-002`, `SRC-003` (независимы).

**Критический путь:** `SRC-003` → `SRC-004` → `SRC-005` → `SRC-006` → `INT-008`.

## Progress

- ✅ VIEWAS-001: View-as infrastructure
- ✅ ADMIN-002: Admin board links + layout guards
- ✅ SRC-003: Sourcing kanban config + tests
- ✅ SRC-004: Sourcing server actions
- ✅ SRC-005: Sourcing kanban UI
- ✅ SRC-006: Sourcing page + create form
- ✅ VIEWAS-007: Admin view-as bar
- ✅ INT-008: Integration polish

---

## VIEWAS-001: View-as infrastructure

| | |
|---|---|
| **Priority** | Critical |
| **Complexity** | Moderate |
| **Dependencies** | None |
| **Agent** | worker |

### Описание

Инфраструктура impersonation для admin (только когда `ENABLE_ADMIN_VIEW_AS` !== `'false'`):

- `src/lib/view-as.ts`: имя cookie, `getViewAsUserIdFromCookies()`, `setViewAsUserId`, `clearViewAsUserId` (server actions или route handler — предпочтительно server actions в `src/actions/view-as.ts`).
- `getEffectiveDbUserId()`: session user id, но если роль сессии `admin` и cookie задан — id из cookie (валидировать: user exists, `is_active`, опционально роль совместима с целевой доской).
- Обновить `createClient()` в `src/lib/app-client.ts` использовать effective id.
- Экспорт хелпера для `withDbSession`: `getEffectiveDbUserId()` в местах, где сейчас передают `session.userId` вручную (минимальный охват: новые sourcing actions + существующие read paths на досках; не рефакторить весь проект в этой задаче).
- `src/lib/auth.ts`: `getEffectiveProfile()` — profile по effective id; `getProfile()` оставить для «кто залогинен» (admin layout, view-as picker).
- `env.production.example`: `ENABLE_ADMIN_VIEW_AS=true`.

### Файлы

- `src/lib/view-as.ts` (new)
- `src/lib/app-client.ts`
- `src/lib/auth.ts`
- `src/actions/view-as.ts` (new)
- `env.production.example`

### Критерии приёмки

- [ ] Admin с cookie видит данные выбранного пользователя (RLS `request.jwt.claim.sub` = impersonated id)
- [ ] Mutations через `createClient` выполняются от impersonated id
- [ ] Non-admin не может установить cookie (action отклоняет)
- [ ] `ENABLE_ADMIN_VIEW_AS=false` → cookie игнорируется / set запрещён
- [ ] Unit/smoke: `getEffectiveDbUserId` без cookie = session id

---

## ADMIN-002: Admin board links + layout guards

| | |
|---|---|
| **Priority** | High |
| **Complexity** | Simple |
| **Dependencies** | None |
| **Agent** | worker |

### Описание

- `nav-config.ts`: секция или items «Просмотр досок» (`/sourcing`, `/app`, `/supplier`) — показывать только если `isAdminViewAsEnabled()` (env).
- `src/app/sourcing/layout.tsx`, `app/layout.tsx`, `supplier/layout.tsx`: guard `profile.role === expected || profile.role === 'admin'` (использовать `getEffectiveProfile()` **после** VIEWAS-001 для отображения досок; для redirect home — реальный `getProfile()` или политика: admin всегда может открыть сегмент).
- Admin layout: без изменения guard (`admin` only).
- Middleware уже пускает authenticated на protected paths — менять не обязательно.

### Файлы

- `src/components/navigation/nav-config.ts`
- `src/app/sourcing/layout.tsx`
- `src/app/app/layout.tsx`
- `src/app/supplier/layout.tsx`

### Критерии приёмки

- [ ] Admin открывает `/sourcing`, `/app`, `/supplier` без redirect
- [ ] `senior_procurement` по-прежнему только `/sourcing`; `procurement` → `/app`; `supplier` → `/supplier`
- [ ] Ссылки «Просмотр досок» в admin sidebar при flag on
- [ ] При flag off ссылок нет (admin остаётся на `/admin/*`)

---

## SRC-003: Sourcing kanban config + tests

| | |
|---|---|
| **Priority** | Critical |
| **Complexity** | Moderate |
| **Dependencies** | None |
| **Agent** | worker → test-writer |

### Описание

`src/lib/sourcing-kanban-config.ts`:

- `SOURCING_KANBAN_COLUMNS`: 8 колонок, labels из `SOURCING_STATUS_LABELS`, variants (muted → success, rejected = danger).
- `sourcingStatusForColumn(columnId)`, `allowedSourcingDropTargets(from)`, `isSourcingTransitionAllowed(from, to)` — матрица A.
- `src/lib/sourcing-kanban-config.test.ts`: все 8 статусов; ±1; reject из каждого non-rejected; rejected→new; запрет skip (например `new`→`got_price`).

### Файлы

- `src/lib/sourcing-kanban-config.ts`
- `src/lib/sourcing-kanban-config.test.ts`

### Критерии приёмки

- [ ] 8 колонок соответствуют порядку `SOURCING_STATUSES`
- [ ] Тесты покрывают матрицу A и отрицательные кейсы
- [ ] `npm test` / vitest green для нового файла

---

## SRC-004: Sourcing server actions

| | |
|---|---|
| **Priority** | Critical |
| **Complexity** | Complex |
| **Dependencies** | VIEWAS-001, SRC-003 |
| **Agent** | worker |

### Описание

`src/actions/sourcing.ts` (server-only):

1. **`updateSupplierSourcingStatus(supplierId, targetStatus)`**
   - Проверка `isSourcingTransitionAllowed`
   - Payload: `sourcing_status`, `works_in_zapros: deriveWorksInZapros(target)` (триггер дублирует — ок)
   - `createClient()` (effective user)
   - При `targetStatus === 'working_in_zapros'`: если нет active supplier user → return `{ ok: false, needsProvision: true }` **без** смены статуса (клиент откроет модал)
   - Иначе update + `revalidatePath('/sourcing')`

2. **`createSourcingSupplier(formData)`** — name required; contacts optional; `sourcing_status: 'new'`; авторизация senior_or_admin через RLS

3. **`provisionSupplierUser(supplierId, email, password)`** — min 8; email required; one active supplier user per supplier; после успеха — опционально завершить отложенный переход в `working_in_zapros` (два шага: provision then move, или combined — задокументировать в action)

Переиспользовать паттерны ошибок из `admin-catalog.ts` / `admin-users.ts`.

### Файлы

- `src/actions/sourcing.ts`
- (возможно) `src/actions/sourcing-types.ts`

### Критерии приёмки

- [ ] Senior может менять статус по матрице A; procurement — denied
- [ ] Admin без view-as: update через RLS admin
- [ ] Admin с view-as senior: поведение как senior
- [ ] Переход в `working_in_zapros` без user → `needsProvision`
- [ ] `provisionSupplierUser` создаёт auth + profile supplier
- [ ] Create supplier всегда `new`

---

## SRC-005: Sourcing kanban UI

| | |
|---|---|
| **Priority** | High |
| **Complexity** | Moderate |
| **Dependencies** | SRC-003, SRC-004 |
| **Agent** | worker |

### Описание

- `src/components/sourcing/sourcing-kanban-card.tsx` — имя, контакты, email (для модала), badge стадии.
- `src/components/sourcing/use-sourcing-kanban-dnd.ts` — mirror `use-request-kanban-dnd.ts`.
- `src/components/sourcing/sourcing-kanban.tsx` — `KanbanBoard<SupplierCard, SourcingStatus>`.
- `src/components/sourcing/provision-supplier-modal.tsx` — email prefilled, password, submit `provisionSupplierUser` then retry status move.

Тип карточки: id, name, contact_person, phone, email, sourcing_status, works_in_zapros (display only).

### Файлы

- `src/components/sourcing/*.tsx`
- `src/components/sourcing/use-sourcing-kanban-dnd.ts`

### Критерии приёмки

- [ ] Drag между соседними колонками и в/из rejected работает
- [ ] Недопустимый drop показывает ошибку (как request kanban)
- [ ] Модал при `needsProvision`; блок если email пустой с понятным сообщением
- [ ] Keyboard/a11y через dnd-kit sensors

---

## SRC-006: Sourcing page + create form

| | |
|---|---|
| **Priority** | High |
| **Complexity** | Moderate |
| **Dependencies** | SRC-005 |
| **Agent** | worker |

### Описание

Заменить заглушку `src/app/sourcing/page.tsx`:

- Server: load all suppliers visible to effective user (`createClient`, select id, name, contacts, sourcing_status, works_in_zapros, order by created_at or name).
- Client section: `SourcingKanban` + compact create form (name + optional fields) → `createSourcingSupplier`.
- Empty state / loading skeleton по паттерну `/app/requests`.

### Файлы

- `src/app/sourcing/page.tsx`
- (опционально) `src/components/sourcing/create-supplier-form.tsx`

### Критерии приёмки

- [ ] `/sourcing` показывает 8 колонок с карточками
- [ ] Senior видит все suppliers (RLS)
- [ ] Созданная карточка появляется в колонке `new` после revalidate
- [ ] Admin на `/sourcing` видит ту же доску (full или view-as)

---

## VIEWAS-007: Admin view-as bar

| | |
|---|---|
| **Priority** | High |
| **Complexity** | Moderate |
| **Dependencies** | VIEWAS-001, ADMIN-002 |
| **Agent** | worker |

### Описание

- `src/components/admin/view-as-bar.tsx` (client): select grouped by role (labels from `ROLE_LABELS`); suppliers filtered `supplier_id != null`; set/clear actions.
- Server: `listUsersForViewAs()` — active profiles + emails (admin client или createClient as admin — только в admin layout).
- Banner в shared shell: расширить `Topbar` или wrapper в layouts `/sourcing`, `/app`, `/supplier`, **admin** when on board links — текст «Просмотр от лица: {full_name} ({role})» + «Сбросить».
- Показывать bar только admin + flag on + cookie set (picker always for admin on admin layout when flag on).

### Файлы

- `src/components/admin/view-as-bar.tsx`
- `src/components/navigation/topbar.tsx` или `view-as-banner.tsx`
- `src/app/admin/layout.tsx` (embed picker)
- Board layouts: banner slot

### Критерии приёмки

- [ ] Picker lists active users by role; supplier rows require supplier_id
- [ ] Set cookie → refresh → board data matches selected user
- [ ] Clear → admin native RLS (`is_admin()`)
- [ ] Writes under impersonation affect only what that user could do
- [ ] Flag off hides picker and board nav (ADMIN-002)

---

## INT-008: Integration polish

| | |
|---|---|
| **Priority** | Medium |
| **Complexity** | Simple |
| **Dependencies** | SRC-006, VIEWAS-007, ADMIN-002 |
| **Agent** | worker → test-runner

### Описание

- `revalidatePath` consistency: `/sourcing`, `/admin/suppliers`, `/admin/users`, board paths after view-as change.
- Smoke: admin → view-as senior → move card; admin → view-as procurement → `/app` loads; provision flow E2E manual checklist.
- Документировать env в README snippet if exists.
- Убедиться `getProfile` в topbar показывает **реального** admin, banner — effective (уточнить UX в коде).

### Критерии приёмки

- [x] No stale UI after mutations
- [x] `npm run lint` / `npm test` pass
- [x] Manual test plan в report (orchestrator documenter)

---

## Риски и edge cases

| Риск | Митигация |
|------|-----------|
| Admin без view-as пишет в suppliers | OK — `is_admin()` в RLS |
| View-as на inactive user | Validate on set cookie |
| Двойной supplier user | Unique constraint / check before provision |
| Email duplicate при provision | Surface `emailExists` message |
| `getProfile` vs effective в layout guard | Admin bypass по реальной роли; данные — effective |
| Concurrent drag | Optimistic UI optional; server wins on error |

## Verification (фаза)

1. `senior_procurement`: full funnel ±1, reject, reject→new, create supplier.
2. Move to `working_in_zapros` without user → modal → provision → success move.
3. Move with empty email → blocked message.
4. `procurement`: `/sourcing` redirect; sees only approved/working in pickers (unchanged).
5. `admin`: board links; view-as senior moves card; view-as supplier sees `/supplier` invites only.
6. `ENABLE_ADMIN_VIEW_AS=false`: no links, no picker.

## Execute

```text
/orchestrate execute orch-2026-06-04-phase7-6-sourcing
```

**Recommended order:** VIEWAS-001 → ADMIN-002 + SRC-003 (parallel) → SRC-004 → SRC-005 → SRC-006 → VIEWAS-007 → INT-008

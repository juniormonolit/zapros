# F010: Старший снабженец и проработка поставщиков

**Дата:** 2026-06-02  
**Статус:** Реализовано (Фаза 2.6 groundwork + Фаза 7.6 канбан); обязательные поля по стадиям — вне MVP  
**Отчёт groundwork:** [`ai_docs/develop/reports/2026-06-02-phase2.6-sourcing-groundwork-report.md`](../reports/2026-06-02-phase2.6-sourcing-groundwork-report.md)  
**План / отчёт 7.6:** [`ai_docs/develop/plans/2026-06-04-phase7-6-sourcing-kanban.md`](../plans/2026-06-04-phase7-6-sourcing-kanban.md) · [`ai_docs/develop/reports/2026-06-04-phase7-6-sourcing-kanban-report.md`](../reports/2026-06-04-phase7-6-sourcing-kanban-report.md)

## Цель

Ввести роль **старший снабженец** (`senior_procurement`), которая прорабатывает новые
контакты/поставщиков по канбану. На успешной стадии поставщик становится доступным
обычному снабженцу для выбора в запросах. Смысл разделения: старший снабженец вовлекает
и квалифицирует новых поставщиков, обычный снабженец работает только с одобренными.

## Роль `senior_procurement` — РЕАЛИЗОВАНА (Фаза 2.6)

- ✅ Новое значение enum `user_role`: `admin`, `senior_procurement`, `procurement`, `supplier`.
- ✅ Маршрут-сегмент: `/sourcing` (канбан проработки, Фаза 7.6).
- ✅ Доступы (RLS + middleware):
  - Видит и двигает карточки поставщиков по воронке (`suppliers.sourcing_status`).
  - Заводит новые карточки поставщиков (наравне с админом).
  - НЕ управляет задачами/запросами снабженца.
  - Админ видит всё.

## Канбан проработки — РЕАЛИЗОВАН (Фаза 7.6)

Стадии = значения `suppliers.sourcing_status`:

```text
new (новый поставщик)
  → called (прозвонил)
  → clarified (уточнил)
  → got_price (получил прайс)
  → test_order (отвезли тестовую заявку)
  → approved (можно работать)            ← доступен снабженцу (контакт вручную)
  → working_in_zapros (работает в Zapros) ← works_in_zapros = true, запрос внутри системы
rejected (не сработались)                 ← недоступен
```

- ✅ Перетаскивание карточки = смена `sourcing_status` (server action, матрица переходов A).
- ✅ Переход в `working_in_zapros` выставляет `works_in_zapros = true` (и наоборот — синхронно).
- ✅ `approved` и `working_in_zapros` → поставщик `available_for_selection` (см. data-model).
- ✅ Провижининг аккаунта поставщика при переходе в `working_in_zapros` без активного user.
- ⏳ Обязательные поля на каждой стадии — не в MVP (уточняется дизайном).

## Кто создаёт карточки

- ✅ **Админ** и **старший снабженец** могут заводить новые карточки поставщиков
  (контакт: название, контактное лицо, телефон, email, заметки) — на `/sourcing` и в admin-UI.
- ✅ Стартовая стадия — `new`.

## Синхронизация `works_in_zapros`

- ✅ **БД-триггер** (миграция 008): `works_in_zapros := (sourcing_status = 'working_in_zapros')` гарантирует консистентность на уровне БД.
- ✅ **Server action** (admin-catalog.ts, sourcing.ts): при смене стадии проверка и установка флага (второй уровень защиты).
- ✅ Single source of truth: стадия — мастер, флаг — производный.

## Связь с выбором поставщиков (Фаза 3 / F003)

При проработке задачи снабженец видит в выборе поставщиков:

- **«Можно отправить запрос»** — `works_in_zapros = true` → запрос уходит внутри Zapros
  (создаётся `request_supplier`, поставщик отвечает в ЛК).
- **«Только связаться вручную»** — `approved`, но `works_in_zapros = false` → показываем как
  «вне системы» (есть телефон/email), запрос в приложении НЕ создаётся; снабженец звонит/пишет.
- Поставщики в стадиях `new…test_order` и `rejected` в выборе снабженца не показываются.

## Модель данных

См. `data-model.md` → `suppliers` (поля `sourcing_status`, `works_in_zapros`, контактные поля,
`created_by`). Отдельной таблицы кандидатов нет — единая таблица `suppliers` (решение принято).

## Влияние на существующее — реализовано в Фазе 2.6

- ✅ Миграция: enum `user_role` += `senior_procurement`; `suppliers` += новые поля + enum `supplier_sourcing_status` (8 значений).
- ✅ Бэкафилл: существующие активные поставщики мигрированы в `sourcing_status='working_in_zapros'`, `works_in_zapros=true`.
- ✅ Admin-провижининг: роль `senior_procurement` добавлена в форму создания пользователя.
- ✅ RLS: политики для `suppliers` (senior+admin — запись/смена стадии; procurement — чтение только `available_for_selection`; supplier — нет доступа).

## Admin View As (Фаза 7.6)

- ✅ Админ: ссылки «Просмотр досок» на `/sourcing`, `/app`, `/supplier` при `ENABLE_ADMIN_VIEW_AS` ≠ `false`.
- ✅ Cookie impersonation: reads/writes через effective user id; баннер и сброс.

## Критерии приёмки (groundwork) — ✅ завершено Фаза 2.6

- [x] Роль `senior_procurement` заводится админом, попадает на `/sourcing`.
- [x] Админ и старший снабженец создают карточку поставщика (стадия `new`).
- [x] Старший снабженец может менять `sourcing_status`; `working_in_zapros` ⇒ `works_in_zapros=true` (триггер БД).
- [x] Снабженец видит только `approved`/`working_in_zapros` поставщиков (RLS).

## Критерии приёмки (канбан UI) — ✅ Фаза 7.6 (частично)

- [x] Старший снабженец двигает карточку по стадиям (drag&drop, матрица A).
- [x] Разрешённые переходы стадий (конфиг `sourcing-kanban-config`).
- [ ] Обязательные поля на каждой стадии (вне MVP).

## Зависимости

- `data-model.md` (suppliers, роли), `auth-rls.md` (роль, RLS), F003 (выбор поставщиков), F008 (админ).

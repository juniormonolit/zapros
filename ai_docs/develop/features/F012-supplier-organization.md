# F012: Организация поставщика (аккаунты, точки, автопарк)

**Дата:** 2026-06-04  
**Статус:** Готово к реализации 7.7a (решение по procurement — 2026-06-04)  
**Заменяет по приоритету:** ядро старого [F011](F011-supplier-custom-fields-warehouses.md) (EAV → подфаза 7.7b, см. ниже)  
**Связано:** [F010](F010-supplier-sourcing.md) (воронка, `works_in_zapros`, провижининг), [data-model.md](../architecture/data-model.md)

## Цель

Доработать модель **Поставщика** как организации с несколькими пользователями, операционными точками (склады, производства), автопарком, категориями/брендами и приоритетом для будущей волновой рассылки — **без переименования** сущности в «Контрагента» и **без поломки** F010, запросов, RLS на `request_suppliers`.

## Принятые решения (согласовано с ТЗ 2026-06-04)

### Терминология и границы

| Решение | Обоснование |
|---------|-------------|
| Основная сущность остаётся **`suppliers` / «Поставщик»** | Уже в БД, UI, F010; переименование в «Контрагента» отклонено |
| Поставщик = **компания**; люди = **пользователи** через membership | Сейчас 1:1 `profiles.supplier_id`; расширяем, не дублируем `users` |
| MVP: **один пользователь → один поставщик** | Таблица membership с `UNIQUE (user_id)` среди активных; many-to-many — задел в схеме без UI |
| Быстрое создание карточки **без аккаунта** | Сохраняем практику F010/7.6: закупщик/старший создаёт `suppliers`, аккаунт — позже |

### Роли: глобальная vs роль внутри поставщика

| Слой | Значение | Где хранится |
|------|----------|--------------|
| Доступ в Zapros | `profiles.role` = `supplier` | Как сейчас; маршрут `/supplier/*` |
| Роль **внутри** организации | `supplier_admin` \| `supplier_user` | Новая таблица `supplier_members` |

**Не плодим** значения `supplier_admin` / `supplier_user` в enum `user_role` — иначе сломается middleware и `/auth/redirect`.

Права:

- **`supplier_admin`:** все запросы организации, ответы (свои и сотрудников), CRUD карточки поставщика, membership, склады, производства, автопарк, категории/бренды на уровне org, каналы уведомлений, базовая статистика (MVP — заглушка/счётчики).
- **`supplier_user`:** запросы организации, свои ответы; ответы коллег — если `suppliers.share_team_responses = true` (default **false**); без управления org и membership.

Несколько `supplier_admin` **разрешены** (нет «единственного главного» в БД). UI: блок «Администраторы» / «Пользователи»; **основной контакт** — существующие поля `suppliers.contact_person`, `phone`, `email` (не привязаны к user_id).

### Совместимость с текущей архитектурой

| Сейчас | После 7.7 |
|--------|-----------|
| `profiles.supplier_id` | Оставляем; **синхронизируется** при создании/смене membership (триггер или server action) для `current_user_supplier_id()` и RLS |
| `provisionSupplierUser` (7.6) | Создаёт `profiles` + **первый** `supplier_members` с `supplier_admin` |
| `sourcing_status`, `works_in_zapros`, trigger 008 | **Без изменений** |
| `supplier_groups` / выбор в запросе | **Без изменений**; фильтры расширяются полями org |
| RLS `request_suppliers` по `supplier_id` | **Без изменений** на уровне invite; все активные members org видят invites org |

### Маршруты UI (внутренние)

ТЗ предлагало `/suppliers` — в проекте сегменты по ролям (`/admin`, `/app`, `/sourcing`).

**Решение:** расширяем **`/admin/suppliers`** и **`/admin/suppliers/[id]`** (вкладки), не вводим корневой `/suppliers` (конфликт с middleware).

| Кто | Доступ к справочнику |
|-----|----------------------|
| `admin` | Полный CRUD |
| `senior_procurement` | Полный CRUD (как сейчас в admin-catalog + sourcing) |
| `procurement` | **Только чтение** карточки и списка (контекст в запросах); CRUD master-data — **не** даём |

Кабинет поставщика (`/supplier/*`): отдельные экраны «Моя организация» / «Команда» — **подфаза 7.7c** (после внутренней карточки).

### Модель данных (новое / расширение `suppliers`)

**Enums:**

- `supplier_kind`: `manufacturer`, `dealer`, `carrier`, `mixed`
- `supplier_wave_priority`: `favorite`, `verified`, `normal`, `reserve`, `stop_list`

**Колонки на `suppliers` (ядро, не EAV):**

- `supplier_kind`, `wave_priority`
- `regions text[]` (регионы работы org)
- `share_team_responses boolean default false`
- `notification_channels text[]` — `email`, `telegram`, `whatsapp`, `cabinet` (MVP: хранение + UI, отправка — F009)
- **Условия работы (MVP):** `works_with_vat`, `payment_deferral_days`, `min_order_amount`, `delivery_available`, `pickup_available`, `terms_comment`
- Существующие: `name`, контакты, `notes`, `sourcing_status`, `works_in_zapros`, `is_active`, `created_by`

**`supplier_members`:**

| Поле | Тип |
|------|-----|
| id | uuid PK |
| user_id | uuid FK → profiles.id UNIQUE (активный member) |
| supplier_id | uuid FK → suppliers |
| member_role | enum `supplier_admin`, `supplier_user` |
| is_active | boolean |
| notification_channels | text[] nullable (fallback → supplier) |
| created_at, updated_at | timestamptz |

**`supplier_warehouses`** и **`supplier_productions`** — отдельные таблицы, **одинаковый набор полей** (как в ТЗ): name, address, region, lat/lng, contact, phone, working_hours, loading_conditions, comment, is_active; склад дополнительно: `pickup_available`, `delivery_available`. Категории/бренды на точке — через junction (ниже), не `text[]` в колонке.

**`supplier_vehicles`:** поля по ТЗ (`vehicle_type` enum, payload, volume, body_length, region, `price_model` enum, base_price, `availability_status` enum, …).

**Категории и бренды (MVP):**

- Справочники `product_categories`, `product_brands` (seed базовый набор из ТЗ).
- Junction: `supplier_categories`, `supplier_brands`; опционально `warehouse_*`, `production_*` для привязки к точке.
- Фильтрация списка поставщиков по junction, не по `ILIKE` в json.

**Волновая рассылка:** на 7.7 — только хранение `wave_priority`, отображение, фильтры; автоматическая рассылка — **отдельная фаза** (не блокер MVP).

**Документы (прайс, договор, сертификаты):** вкладка в UI **заглушка** «Скоро», без таблиц в 7.7.

### F011 (EAV) — судьба

| Подфаза | Содержание |
|---------|------------|
| **7.7a (F012)** | Организация: membership, kind, priority, warehouses, productions, vehicles, categories/brands, условия, внутренняя карточка |
| **7.7b (F011)** | EAV + `warehouse_nomenclature_rules` — **после 7.7a**, если нужны admin-настраиваемые поля сверх структуры |
| **7.7c** | Кабинет `supplier_admin`: команда, настройки org (ограниченный CRUD) |

Структурированные поля из ТЗ **не выносятся в EAV** на первом шаге.

### RLS (направление)

- `suppliers` INSERT/UPDATE: `admin`, `senior_procurement`; SELECT: + `procurement` (read).
- `supplier_members`, warehouses, productions, vehicles: write — `admin`, `senior`, `supplier_admin` (только свой `supplier_id`); read supplier portal — свой org.
- Схема EAV (7.7b): без изменений концепции F011.

### Acceptance criteria (7.7a)

1. Создать поставщика без аккаунта.  
2. `supplier_kind`, `wave_priority`.  
3. Несколько `supplier_members`, роли admin/user.  
4. Несколько складов, производств, машин.  
5. Фильтры: тип, приоритет, категория, бренд, регион, активность.  
6. Карточка с вкладками (основное, контакты/аккаунты, склады, производства, автопарк, условия; документы — заглушка).  
7. F010, запросы, invites, `works_in_zapros` — регрессия зелёная.  
8. Провижининг 7.6 создаёт membership `supplier_admin`.

## Вне scope 7.7

CRM, реквизиты, юр. документооборот, сложная аналитика, матрица прав > 2 ролей member, many-to-many user↔supplier, автоматическая волновая рассылка, реальная отправка telegram/whatsapp.

## Решение: права `procurement` (принято 2026-06-04)

**Вариант A (принят):** роль `procurement` — **только чтение** расширенной карточки поставщика, списка и фильтров (контекст при работе с запросами). Создание и редактирование master-data (`suppliers`, members, склады, производства, автопарк, справочники org) — только **`admin`** и **`senior_procurement`**.

**Не принят вариант B** (полный CRUD для procurement): потребовал бы расширения RLS и отдельного UI в `/app`; отложено.

**Импликации для 7.7a:** RLS INSERT/UPDATE на org-таблицах — `admin`, `senior_procurement`, `supplier_admin` (свой org); SELECT для `procurement` — read-only на `suppliers` и связанных справочниках org без write-политик.

## Ссылки

- План реализации: [`2026-06-04-phase7-7-supplier-organization.md`](../plans/2026-06-04-phase7-7-supplier-organization.md)  
- MVP-план: [`2026-06-01-mvp.md`](../plans/2026-06-01-mvp.md) § Фаза 7.7

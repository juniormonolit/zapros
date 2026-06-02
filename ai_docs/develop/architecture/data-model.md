# Модель данных

**Дата:** 2026-06-01

## ER-обзор

```text
bitrix_group_settings
suppliers ──┬── supplier_group_members ── supplier_groups
            └── profiles (supplier)

profiles (procurement | admin)
tasks ── task_items
tasks ── requests ── request_items ── task_items
requests ── request_suppliers ── suppliers
request_suppliers ── supplier_response_versions ── response_line_items
request_suppliers ── request_events (тред + сигналы)
requests ── request_change_log (опционально MVP: через events)
```

## Таблицы

### `profiles`

Расширение `auth.users`.

| Поле | Тип | Описание |
|------|-----|----------|
| id | uuid PK | = auth.users.id |
| role | enum | `admin`, `senior_procurement`, `procurement`, `supplier` |
| full_name | text | |
| supplier_id | uuid FK nullable | Для role=supplier |
| is_active | boolean | |
| notify_email | text nullable | Email для уведомлений (см. F009) |
| notify_on_new_request | boolean default false | Уведомлять о новых запросах |
| notify_on_completed | boolean default false | Уведомлять о завершении/итоге |
| created_at | timestamptz | |

**Создание профиля:** триггер `on_auth_user_created` (AFTER INSERT на `auth.users`) создаёт строку `profiles`; роль и `supplier_id` проставляет admin-экшен (см. auth-rls.md).

**Единственный администратор:** частичный уникальный индекс
`CREATE UNIQUE INDEX one_admin ON profiles ((role)) WHERE role = 'admin';`

### `bitrix_group_settings`

| Поле | Тип | Описание |
|------|-----|----------|
| id | uuid PK | |
| name | text UNIQUE | Как в paste: `мск_Утеплитель` |
| url_template | text | `{task_id}` placeholder |
| is_active | boolean | |

### `suppliers`

| Поле | Тип | Описание |
|------|-----|----------|
| id | uuid PK | |
| name | text | Юр. название |
| contact_person | text nullable | ФИО контактного лица |
| phone | text nullable | Телефон (для «прозвонить») |
| email | text nullable | Email (для «написать») |
| notes | text nullable | Заметки старшего снабженца |
| sourcing_status | enum | Стадия воронки проработки (см. ниже, F010) |
| works_in_zapros | boolean default false | «Работает в системе Zapros» — терминальная успешная стадия; можно слать запрос ВНУТРИ приложения |
| is_active | boolean | Активен (не скрыт/не удалён) |
| created_by | uuid FK profiles nullable | Кто завёл карточку (admin/senior) |
| created_at | timestamptz | |

**Воронка проработки (`sourcing_status`).** Карточка поставщика = «будущий поставщик»,
которую ведёт старший снабженец (F010). Черновые стадии (детали канбана уточняются):

```text
new → called → clarified → got_price → test_order → approved → working_in_zapros
                                                              ↘ rejected
```

- `approved` («Можно работать») — поставщик проработан и **доступен для выбора** снабженцем
  в Фазе 3, но связь — вручную (прозвонить/написать), запрос в приложении ему не уходит.
- `working_in_zapros` — поставщик активно работает в приложении; `works_in_zapros = true`;
  снабженец может отправить ему запрос **внутри системы**. Цель старшего снабженца —
  довести `approved` до `working_in_zapros`.
- `rejected` («Не сработались») — недоступен для выбора.

**Производные правила для Фазы 3 (выбор поставщиков):**

- `available_for_selection` = `sourcing_status in ('approved','working_in_zapros') and is_active`
- `can_receive_system_request` = `works_in_zapros = true and is_active`
  (эквивалентно `sourcing_status = 'working_in_zapros'`).

`works_in_zapros` держим в синхроне со стадией `working_in_zapros` (single source of truth —
стадия; флаг — для быстрых выборок/фильтров).

> **Синхронизация реализована** (миграция 008): БД-триггер `sync_supplier_works_in_zapros` устанавливает `works_in_zapros := (sourcing_status = 'working_in_zapros')` при AFTER INSERT/UPDATE на `suppliers`. Гарантирует консистентность на уровне БД, даже при ошибке server action или прямом SQL-изменении.

> **RLS напоминание:** Роль `supplier` (поставщик) не имеет SELECT доступа к таблице `suppliers` (видит только контакты в задаче через `task_items` / запросе через `request_items`). Только `admin`, `senior_procurement`, `procurement` имеют доступ, дифференцированный по правилам выше.

### `supplier_groups` / `supplier_group_members`

Группы для UI с чекбоксами. Поставщик может быть в **нескольких** группах.

### Кастомные поля поставщика (admin-конфигурируемая схема, EAV) — см. F011

Поставщик = гибкая «база»: админ добавляет поля по мере необходимости. Ядро
(`name`, контакты, `sourcing_status`, `works_in_zapros`) остаётся колонками; кастомные поля —
поверх через EAV. Реализуется **после Фазы 3** (Фаза 7.7).

#### `supplier_field_definitions` (схему ведёт админ)

| Поле | Тип | Описание |
|------|-----|----------|
| id | uuid PK | |
| key | text UNIQUE | Машинный ключ поля |
| label | text | Подпись в UI |
| field_type | enum | `text`, `masked_text`, `number`, `date`, `boolean`, `single_select`, `multi_select` |
| options | jsonb nullable | Список вариантов для `single_select`/`multi_select` (задаёт админ) |
| mask | text nullable | Маска ввода для `masked_text` (напр. телефон, ФИО) |
| is_required | boolean default false | |
| sort_order | int default 0 | |
| is_active | boolean default true | |
| created_at | timestamptz | |

#### `supplier_field_values` (EAV — строка на поле)

| Поле | Тип | Описание |
|------|-----|----------|
| id | uuid PK | |
| supplier_id | uuid FK suppliers on delete cascade | |
| field_id | uuid FK supplier_field_definitions on delete cascade | |
| value | jsonb | Скаляр или массив (для `multi_select` — массив выбранных вариантов) |
| updated_at | timestamptz | |

UNIQUE `(supplier_id, field_id)`. Валидация значения против `field_definitions.field_type`/`options`
выполняется в server actions (тип, допустимость вариантов, маска).

Пример: поле «Форма оплаты» (`multi_select`, options `["С НДС","Без НДС","Нал"]`) →
у поставщика `value = ["С НДС","Нал"]` (старший снабженец отметил галочками, как поставщик работает).

### `supplier_warehouses` (склады поставщика) — см. F011

| Поле | Тип | Описание |
|------|-----|----------|
| id | uuid PK | |
| supplier_id | uuid FK suppliers on delete cascade | |
| name | text | Напр. название завода/площадки |
| address | text nullable | |
| working_hours | text nullable | Режим работы (свободный текст, MVP) |
| sort_order | int default 0 | |
| created_at | timestamptz | |

#### `warehouse_nomenclature_rules` (правила привязки номенклатур к складу)

| Поле | Тип | Описание |
|------|-----|----------|
| id | uuid PK | |
| warehouse_id | uuid FK supplier_warehouses on delete cascade | |
| match_type | enum | `contains`, `starts_with`, `ends_with`, `equals`, `regex` |
| value | text | Шаблон (напр. `ЛСР`) |
| created_at | timestamptz | |

Правила сейчас только хранятся; применяются позже (когда появится справочник `nomenclature`):
номенклатура с совпадением по правилу авто-привязывается к складу → поставщику → истории цен.
Пример: склад «ЛСР» с правилом `contains "ЛСР"` ловит номенклатуры с «ЛСР» в названии.

### `tasks`

| Поле | Тип | Описание |
|------|-----|----------|
| id | uuid PK | |
| created_by | uuid FK profiles | Снабженец |
| bitrix_task_number | integer UNIQUE | Номер из «Задача № …» |
| bitrix_url | text | Собранный URL |
| title | text | Из сделки/заголовка |
| manager_name | text | |
| delivery_address | text | Населенный пункт |
| payment_form | enum | `cash`, `non_cash` |
| delivery_date | date | |
| category | text | Из «Задача в проекте (группе)» |
| purposes | text nullable | |
| deal_title | text nullable | |
| requested_at | timestamptz nullable | «Сделал запрос снабженцу» |
| raw_paste | text | Исходный текст |
| status | enum | `active`, `partially_closed`, `completed`, `archived` |
| created_at, updated_at | timestamptz | |

### `task_items`

| Поле | Тип | Описание |
|------|-----|----------|
| id | uuid PK | |
| task_id | uuid FK | |
| sort_order | int | |
| name | text | |
| quantity | numeric | |
| unit | text | шт, упак, м³ |
| comment | text nullable | |
| line_status | enum | `free`, `in_request`, `closed`, `rejected` |

### `requests`

| Поле | Тип | Описание |
|------|-----|----------|
| id | uuid PK | |
| request_code | text UNIQUE | Человекочитаемый код, напр. `R-2026-000123` (для треда/ссылок) |
| task_id | uuid FK | |
| created_by | uuid FK | |
| status | enum | `draft`, `new`, `awaiting_responses`, `has_response`, `clarification`, `in_progress`, `won`, `lost`, `no_response`, `cancelled` |
| outcome | enum nullable | `won`, `lost`, `cancelled` |
| needs_delivery | boolean | Самовывоз vs доставка |
| payment_form | enum | Копия с задачи на момент создания |
| comment | text nullable | Комментарий к запросу |
| winning_supplier_id | uuid nullable | |
| winning_request_supplier_id | uuid nullable | |
| reject_reason | enum nullable | Общая причина брака для проигравших |
| reject_comment | text nullable | |
| sent_at | timestamptz nullable | |
| completed_at | timestamptz nullable | |
| created_at, updated_at | timestamptz | |

### `request_items`

| Поле | Тип | Описание |
|------|-----|----------|
| id | uuid PK | |
| request_id | uuid FK | |
| task_item_id | uuid FK | |
| name, quantity, unit | snapshot | На момент отправки |

### `request_suppliers`

Пара **запрос–поставщик** (канбан поставщика, таймер, тред).

| Поле | Тип | Описание |
|------|-----|----------|
| id | uuid PK | |
| request_id | uuid FK | |
| supplier_id | uuid FK | |
| status | enum | См. status-machines.md |
| sent_at | timestamptz | Старт таймера |
| deadline_at | timestamptz | sent_at + response_deadline_days (кал. дни), Europe/Moscow |
| timer_paused_at | timestamptz nullable | На «На уточнении» |
| first_response_at | timestamptz nullable | |
| created_at, updated_at | timestamptz | |

UNIQUE `(request_id, supplier_id)`.

### `supplier_response_versions`

| Поле | Тип | Описание |
|------|-----|----------|
| id | uuid PK | |
| request_supplier_id | uuid FK | |
| version_number | int | 1, 2, 3… |
| is_current | boolean | Одна true на invite |
| comment | text nullable | |
| submitted_at | timestamptz | |
| created_by | uuid FK | Поставщик user |

### `response_line_items`

На каждую строку `request_items` в версии ответа.

| Поле | Тип | Описание |
|------|-----|----------|
| id | uuid PK | |
| version_id | uuid FK | |
| request_item_id | uuid FK | |
| price_with_vat | numeric nullable | |
| price_cash | numeric nullable | |
| price_without_vat | numeric nullable | |
| delivery_price | numeric nullable | |
| price_includes_delivery | boolean default false | Взаимоисключимо с delivery_price |
| in_stock | boolean nullable | XOR с lead_time_days |
| lead_time_days | int nullable | |
| line_comment | text nullable | |

**Правило UI + CHECK-констрейнты в БД (не только UI):**

```sql
-- наличие XOR срок
CHECK (NOT (in_stock IS NOT NULL AND lead_time_days IS NOT NULL))
-- доставка: сумма XOR «цена с доставкой»
CHECK (NOT (delivery_price IS NOT NULL AND price_includes_delivery = true))
```

**Правило оплаты запроса:** при `payment_form = non_cash` поле `price_cash` скрыто/запрещено.

### Цена для сравнения (нормализация)

Снабженцу показываются **все** заполненные варианты, но для сортировки/«лучшего» нужна единая база. Правило приведения нала к безналу:

```text
безнал_эквивалент(нал) = price_cash / 0.84   # учёт ~16% разницы нал/безнал
```

- Сравнительная цена строки = минимальный из доступных, приведённых к безналу:
  `min(price_without_vat, price_with_vat, price_cash / 0.84)` среди заполненных.
- Коэффициент `0.84` вынести в `app_settings.cash_to_noncash_ratio` (настраиваемый).
- Решение всё равно за снабженцем: показываем лучшие из 3 вариантов, нормализация — только для подсветки/сортировки.

### `request_events`

Чат + быстрые сигналы + системные события.

| Поле | Тип | Описание |
|------|-----|----------|
| id | uuid PK | |
| request_supplier_id | uuid FK | |
| author_id | uuid FK profiles | |
| event_type | enum | `message`, `signal_cheaper`, `signal_customer_price`, `signal_in_progress`, `status_change`, `request_updated`, `response_submitted` |
| payload | jsonb nullable | |
| body | text nullable | |
| created_at | timestamptz | |

### `category_supplier_group_hints` (опционально MVP)

| category | supplier_group_id | Подсказка при отправке |

### `app_settings`

Глобальные настройки (один ряд или key-value), редактируются админом.

| Ключ | Тип | Дефолт | Описание |
|------|-----|--------|----------|
| `response_deadline_days` | int | 10 | Срок ответа (календарные дни) до архива |
| `cash_to_noncash_ratio` | numeric | 0.84 | Коэффициент приведения нал→безнал |

### `notifications` (см. F009, можно отложить в реализации)

| Поле | Тип | Описание |
|------|-----|----------|
| id | uuid PK | |
| profile_id | uuid FK | Получатель |
| type | enum | `new_request`, `request_completed` |
| request_supplier_id | uuid FK nullable | Контекст |
| email_to | text nullable | Куда отправлено |
| status | enum | `pending`, `sent`, `failed` |
| created_at, sent_at | timestamptz | |

## Счётчики на задаче

Вычисляемые (view или query):

- `requests_total` — всего запросов по задаче
- `requests_in_progress` — запросы не в финальной стадии
- `requests_completed` — `outcome` задан или финальный статус

## Индексы (рекомендации)

- `tasks(bitrix_task_number)`, `tasks(created_by)`
- `requests(task_id)`, `requests(created_by)`, `requests(status)`
- `request_suppliers(supplier_id)`, `request_suppliers(deadline_at)` WHERE status ожидает ответ
- `request_events(request_supplier_id, created_at)`

## Аналитика (заложить поля, UI позже)

- `request_suppliers.first_response_at`
- `requests.completed_at`, `outcome`
- Длительность ответа = `first_response_at - sent_at`

## Задел: номенклатуры и история цен (НЕ в текущих фазах)

Будущая интеграция с существующей базой товаров: мэтчинг строк запроса/ответа с реальными
номенклатурами и накопление истории цен по номенклатуре. **Сейчас не реализуется**, но
проектируем «швы», чтобы потом не ломать схему:

- `nomenclature` — справочник реальных товаров (импорт из внешней базы): `id`, `external_id`,
  `name`, `unit`, `category`, …
- `price_history` — точки цены по номенклатуре во времени: `nomenclature_id`, `supplier_id`,
  `price`, `price_type` (нал/безнал±НДС), `source` (ответ/ручной импорт), `request_id` nullable,
  `observed_at`.
- Точки расширения существующих таблиц (позже, nullable, без ломки): `task_items.nomenclature_id`,
  `response_line_items.nomenclature_id`. При подтверждённом мэтче строка ответа порождает точку
  в `price_history`.
- **Механизм мэтчинга — `warehouse_nomenclature_rules`** (см. выше): номенклатура → правило склада →
  склад → поставщик. Так цена с номенклатуры попадает в нужный склад/поставщика для истории.
- В текущих фазах поля `nomenclature_id` НЕ добавляем — только фиксируем намерение.

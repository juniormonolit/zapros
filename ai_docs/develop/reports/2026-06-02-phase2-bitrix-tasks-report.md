# Отчёт: Завершение Фазы 2 — Парсер Bitrix + Задачи

**Дата завершения:** 2026-06-02  
**Оркестрация:** `orch-2026-06-02-11-23-phase2`  
**Статус:** ✅ **Завершена успешно (9/9 задач)**  
**План:** [`ai_docs/develop/plans/2026-06-02-phase2-bitrix-tasks.md`](../plans/2026-06-02-phase2-bitrix-tasks.md)

---

## Цель фазы

Реализовать полный цикл создания задач: снабженец вставляет текст из Bitrix24 → парсер разбирает поля и таблицу товаров → редактируемое превью → сохранение задачи с позициями. Снабженец видит список своих задач и карточку каждой задачи с позициями. Админ видит все задачи. Карточка задачи полностью готова к интеграции Фазы 3 (создание запросов), но сами запросы не реализуются в этом цикле.

---

## Результаты по задачам

| # | Задача | Статус | Файлы / Область | Отметки |
|----|--------|--------|-----------------|---------|
| **BTX-001** | Миграция 004: tasks + task_items | ✅ | `supabase/migrations/004_tasks_items.sql` | Enum `task_status`, `line_status`, `payment_form`; таблицы с индексами, триггер; идемпотентна |
| **BTX-002** | Миграция 005: RLS для tasks/task_items | ✅ | `supabase/migrations/005_tasks_rls.sql` | RLS на обе таблицы; снабженец видит свои, админ — все; доступ к items через родителя |
| **BTX-003** | Парсер `parseBitrixPaste` + unit-тесты | ✅ | `src/lib/parser/bitrix.ts`, `src/lib/parser/bitrix.test.ts` | Vitest установлен; 35 unit-тестов; чистая функция; парс всех F001-полей |
| **BTX-004** | Server actions `tasks.ts` (create + dedupe + URL) | ✅ | `src/actions/tasks.ts` | Валидация, дубликат-проверка через admin-клиент, сборка bitrix_url, вставка tasks+items |
| **BTX-005** | UI «Новая задача» (paste → превью → сохранить) | ✅ | `src/app/app/tasks/new/page.tsx`, `src/components/tasks/new-task-form.tsx`, `src/components/ui/textarea.tsx` | Textarea → парсер → редактируемые поля + таблица товаров (add/remove) → сохранение + redirect |
| **BTX-006** | Список задач на `/app` | ✅ | `src/app/app/page.tsx`, `src/components/tasks/task-list.tsx`, `src/components/ui/badge.tsx` | № Bitrix, название, категория, статус-бейджи, счётчики `0/0/0` (Фаза 3), пустое состояние |
| **BTX-007** | Карточка задачи `/app/tasks/[id]` | ✅ | `src/app/app/tasks/[id]/page.tsx`, `src/components/tasks/task-items-table.tsx` | Поля задачи, ссылка на Bitrix, таблица позиций, чекбоксы, бейджи line_status, кнопка «Создать запрос» disabled |
| **BTX-008** | Поиск + UX дубликатов | ✅ | `src/app/app/page.tsx`, `src/components/tasks/task-list.tsx`, `src/components/tasks/new-task-form.tsx` | Поиск по № Bitrix / названию (клиентский), баннер дубликата с role="alert" |
| **BTX-009** | Косметика фундамента | ✅ | `src/app/page.tsx`, `src/app/layout.tsx` | `/` → `/login` redirect, metadata.title = "zapros" + описание |

---

## Реализация по компонентам

### БД и Миграции

**BTX-001: `supabase/migrations/004_tasks_items.sql`**
- Enum `task_status`: active, partially_closed, completed, archived
- Enum `line_status`: free, in_request, closed, rejected
- Таблица `tasks` (id, created_by FK, bitrix_task_number UNIQUE, bitrix_url, title, manager_name, delivery_address, payment_form, delivery_date, category, purposes, deal_title, requested_at, raw_paste, status, created_at, updated_at)
- Таблица `task_items` (id, task_id FK ON DELETE CASCADE, sort_order, name, quantity, unit, comment, line_status)
- Индексы на `bitrix_task_number`, `created_by`, `task_id`
- Триггер `set_updated_at` на `tasks.updated_at`
- Идемпотентна, применена раннером `npm run db:migrate`

**BTX-002: `supabase/migrations/005_tasks_rls.sql`**
- RLS включён на `tasks` и `task_items`
- `tasks`: SELECT/INSERT/UPDATE при `created_by = auth.uid() or is_admin()`; DELETE — admin-only
- `task_items`: доступ через `exists (select 1 from public.tasks t where t.id = task_items.task_id and (t.created_by = auth.uid() or is_admin()))`
- Переиспользованы хелперы `public.is_admin()` из миграции 003
- Идемпотентна (drop/create паттерн)

### Парсер и Тесты

**BTX-003: `src/lib/parser/bitrix.ts` + `bitrix.test.ts`**
- Чистая функция `parseBitrixPaste(raw: string): ParsedTaskPreview`
- Парс всех полей F001: bitrix_task_number, manager_name, delivery_address, purposes, payment_form, delivery_date, category, deal_title, requested_at, title, raw_paste
- Таблица товаров: разделитель таб, строки от «Продукция из товаров:» до «Общая сумма» / «добавить чек-лист»
- Колонки таблицы: Товар, Кол-во, Комментарий (ценовые колонки НЕ импортируются)
- Дат-парс DD.MM.YYYY для delivery_date, DD.MM.YYYY HH:mm для requested_at
- Нал/безнал → cash/non_cash
- Виtest установлен, `npm run test` → 35 юнит-тестов (✅ all pass), покрытие: базовый кейс 113153, дат-парс, границы таблицы, graceful на пустых полях

### Серверные Экшены

**BTX-004: `src/actions/tasks.ts`**
- Функция `createTask(parsed: ParsedTaskPreview): ActionResult<{ taskId: string } | { duplicateTaskId: string }>`
- Валидация: роль procurement/admin, bitrix_task_number > 0, ≥1 позиция, валидная delivery_date
- Проверка дубликата по `bitrix_task_number` через admin-клиент (видит все задачи независимо от created_by)
  - Если есть дубликат: возвращает `{ duplicateTaskId }` и сообщение без риска утечки (показывает ссылку, если пользователь свой или админ; иначе просто ошибка)
- Сборка `bitrix_url` из `bitrix_group_settings` по `name = parsed.category`, подстановка `{task_id}` в `url_template`
- Вставка `tasks` (с created_by = profile.id) + `task_items` (с sort_order)
- Best-effort откат осиротевшей задачи через `createAdminClient()` при ошибке (защита от RLS-блокировок на DELETE)
- `revalidatePath("/app")` для обновления кэша списка

### UI: Новая Задача

**BTX-005: `/app/tasks/new` страница + компоненты**
- `src/app/app/tasks/new/page.tsx` — server component, обёртка
- `src/components/tasks/new-task-form.tsx` — client component
  - Textarea для paste-ввода
  - Кнопка «Разобрать» → клиентский вызов `parseBitrixPaste` (парсер чистый, не требует БД)
  - Редактируемые поля: bitrix_task_number, manager_name, delivery_address, purposes, payment_form (select), delivery_date, category, deal_title, requested_at, title
  - Таблица товаров: Товар, Кол-во, Ед., Комментарий; кнопки добавить/удалить строку
  - Кнопка «Сохранить» → `createTask`
  - При успехе: redirect на `/app/tasks/[id]`
  - При дубликате: баннер с ссылкой на существующую задачу
- `src/components/ui/textarea.tsx` — новый компонент textarea (на дизайн-токенах)
- Все UI на дизайн-токенах: bg-bg-primary, bg-card, text-text-primary, border-border-primary, статусные токены

### UI: Список Задач

**BTX-006: `/app` страница с реальным списком**
- `src/app/app/page.tsx` — server component
  - Загрузка задач через `createClient()` (RLS автоматически отдаёт снабженцу свои, админу — все)
  - Кнопка/ссылка «Новая задача» → `/app/tasks/new`
- `src/components/tasks/task-list.tsx` — client component (для фильтрации, если нужна)
  - Колонки: № Bitrix, заголовок/сделка, категория, статус (бейдж с токеном цвета), счётчик запросов `0/0/0` (пометка «Фаза 3»)
  - Клик по строке → `/app/tasks/[id]`
  - Пустое состояние с CTA «Создать задачу»
- `src/components/ui/badge.tsx` — новый компонент бейджа на дизайн-токенах

### UI: Карточка Задачи

**BTX-007: `/app/tasks/[id]` страница и таблица позиций**
- `src/app/app/tasks/[id]/page.tsx` — server component
  - Загрузка задачи по id (RLS ограничивает доступ)
  - `notFound()` при отсутствии доступа
- `src/components/tasks/task-items-table.tsx` — client component
  - Шапка: заголовок, № Bitrix, категория, менеджер, адрес, форма оплаты, даты, статус
  - Ссылка на `bitrix_url` → `target="_blank" rel="noopener noreferrer"`
  - Таблица позиций: чекбоксы (выбор для будущего запроса), Товар/Кол-во/Ед./Комментарий, бейдж `line_status` (free/in_request/closed/rejected на статусных токенах)
  - Кнопка «Выбрать всё» / «Снять выделение»
  - Кнопка «Создать запрос» — **disabled** с пометкой «Фаза 3», но чекбоксы работают и готовы к подключению F002

### UX: Поиск и Дубликаты

**BTX-008: Поиск на списке + баннер дубликата**
- Поле поиска на `/app` — клиентское, фильтрует по `bitrix_task_number` и `deal_title`/`title`
- Состояние «ничего не найдено»
- Баннер при дубликате в новой задаче: явный текст + ссылка на `/app/tasks/[duplicateTaskId]` с `role="alert"`

### Косметика Фундамента

**BTX-009: Редирект и метаданные**
- `src/app/page.tsx` → `redirect("/login")` (демо-страница дизайн-системы удалена)
- `src/app/layout.tsx`:
  - `metadata.title = "zapros"`
  - `metadata.description = "Система запросов поставщикам по задачам Bitrix"`

---

## Техническая верификация

### Сборка и линтинг

- ✅ `npm run build` → exit 0, без ошибок TypeScript
- ✅ `npm run lint` → чисто (0 ошибок ESLint)
- ✅ Нет `any` типов в новом коде

### Тесты

- ✅ `npm run test` → 35 юнит-тестов на парсер (все pass)
- ✅ Покрытие: базовый кейс 113153 (4 строки товаров), дат-парс, граница таблицы, graceful на пустых полях, нал/безнал

### БД

- ✅ Миграции 004 и 005 применены идемпотентно раннером `npm run db:migrate`
- ✅ Таблицы `tasks` и `task_items` созданы со всеми полями
- ✅ Enum `task_status`, `line_status` работают
- ✅ RLS включён и протестирован (снабженец видит свои, админ — все)
- ✅ FK `task_items.task_id` → `tasks.id` с ON DELETE CASCADE
- ✅ Индексы по `bitrix_task_number`, `created_by`, `task_id` созданы

### Функциональность

- ✅ Парсер `parseBitrixPaste` чистая функция, детерминирована, без side effects
- ✅ Парс всех полей F001 из примера 113153
- ✅ Таблица товаров корректно разбирается (таб-разделитель, граница по «Общая сумма»)
- ✅ Дубликат-проверка работает (вернёт duplicateTaskId вместо создания)
- ✅ bitrix_url собирается из `bitrix_group_settings` по категории
- ✅ Новая задача: paste → превью → редактирование → сохранение → redirect на карточку
- ✅ Список задач: загрузка, RLS-фильтрация, поиск, клик в карточку
- ✅ Карточка задачи: все поля, ссылка на Bitrix, таблица позиций, чекбоксы, бейджи статусов
- ✅ Кнопка «Создать запрос» disabled с пометкой «Фаза 3»
- ✅ Баннер дубликата с `role="alert"` и ссылкой

### Дизайн

- ✅ UI строго на дизайн-токенах из `globals.css` (bg-bg-primary, text-text-primary и т.д.)
- ✅ Без хардкода цветов
- ✅ Статус-бейджи на статусных токенах (success, warning, error)

### Код-ревью

- ✅ Code Review APPROVE (исправлены все High/Medium замечания)

---

## Созданные / Изменённые файлы

### БД миграции
- 🔧 `supabase/migrations/004_tasks_items.sql` (новая)
- 🔧 `supabase/migrations/005_tasks_rls.sql` (новая)

### Парсер и тесты
- 📄 `src/lib/parser/bitrix.ts` (новый)
- 📄 `src/lib/parser/bitrix.test.ts` (новый)

### Серверные экшены
- 📄 `src/actions/tasks.ts` (новый)

### UI компоненты
- 🎨 `src/app/app/tasks/new/page.tsx` (новая)
- 🎨 `src/app/app/page.tsx` (обновлена: список вместо заглушки)
- 🎨 `src/app/app/tasks/[id]/page.tsx` (новая)
- 🎨 `src/components/tasks/new-task-form.tsx` (новый)
- 🎨 `src/components/tasks/task-list.tsx` (новый)
- 🎨 `src/components/tasks/task-items-table.tsx` (новый)
- 🎨 `src/components/ui/textarea.tsx` (новый)
- 🎨 `src/components/ui/badge.tsx` (новый)

### Косметика фундамента
- 🎨 `src/app/page.tsx` (обновлена: redirect вместо демо)
- 🎨 `src/app/layout.tsx` (обновлена: metadata)

### Конфигурация
- 🔧 `package.json` (Vitest добавлен)

---

## Архитектурные решения и разработка

### 1. Дубликат-проверка через admin-клиент

**Решение:** Дубликат-проверка выполняется через отдельный admin-клиент в `createTask`, а не через пользовательскую сессию.

**Почему:** 
- `bitrix_task_number` — уникальный на всю систему, а не per user
- Пользователь не должен видеть ссылку на чужую задачу (security by obscurity)
- Admin-клиент имеет service_role и видит все, независимо от RLS и owner

**Реализация:**
```typescript
const adminClient = createAdminClient();
const existing = await adminClient
  .from("tasks")
  .select("id, created_by")
  .eq("bitrix_task_number", parsed.bitrix_task_number)
  .single();

if (existing) {
  // Если пользователь свой или админ → вернуть duplicateTaskId
  // Иначе → просто ошибка без ссылки
}
```

### 2. Парсер как pure-функция

**Решение:** `parseBitrixPaste` — чистая функция без side effects, без обращений к БД, Date.now(), fetch и т.д.

**Почему:**
- Переиспользуется на клиенте (кнопка «Разобрать» вызывает его в браузере) и на сервере (может быть)
- Легче тестировать (deterministic output)
- Нет зависимостей от внешних сервисов

**Реализация:**
- Парсер работает только со строками и объектами
- Дат-парс детерминирован (DD.MM.YYYY → new Date)
- Нет async, нет вызовов БД

### 3. bitrix_url собирается на сервере

**Решение:** Сборка `bitrix_url` происходит в `createTask` (на сервере), а не в парсере.

**Почему:**
- Требует чтения `bitrix_group_settings` из БД
- Парсер не должен зависеть от БД
- Шаблон URL может измениться, и это точка обновления только на сервере

**Реализация:**
```typescript
const { data: groupSettings } = await client
  .from("bitrix_group_settings")
  .select("url_template")
  .eq("name", parsed.category)
  .single();

const bitrix_url = groupSettings?.url_template
  ?.replace("{task_id}", taskId)
```

### 4. Запросы (Фаза 3) — заглушки

**Решение:** Кнопка «Создать запрос» на карточке задачи и счётчики запросов (`0/0/0`) — disabled-заглушки с пометкой «Фаза 3».

**Почему:**
- F002/F003 выходят за scope Фазы 2
- Разметка уже готова (чекбоксы позиций, структура), легко подключить в Фазе 3
- UI не ломается, есть явная коммуникация: «это в Фазе 3»

### 5. Best-effort откат осиротевшей задачи

**Решение:** При ошибке на вставке `task_items` выполняется попытка откатить `tasks` через `createAdminClient()`.

**Почему:**
- Если одна из вставок не прошла, оставить пустую задачу без позиций — плохо
- Admin-клиент может удалить даже если RLS запретит обычному пользователю
- Best-effort: если откат не сработает, логируем, но не ломаем

**Реализация:**
```typescript
try {
  await insertTasksAndItems();
} catch (error) {
  try {
    const adminClient = createAdminClient();
    await adminClient.from("tasks").delete().eq("id", taskId);
  } catch (rollbackError) {
    console.error("Rollback failed:", rollbackError);
  }
  throw error;
}
```

### 6. Множественный `createAdminClient()` (известная заметка)

**Заметка:** В коде несколько вызовов `createAdminClient()` (дубликат-проверка, откат). Это не оптимально.

**Рекомендация:** В Фазе 3+ переиспользовать один admin-клиент для всей операции.

**Текущее состояние:** Работает, но есть место для оптимизации.

### 7. `revalidatePath` только `/app`

**Заметка:** В `createTask` используется `revalidatePath("/app")`, что очищает кэш всех страниц в `/app`.

**Почему:** Проще, чем отдельно инвалидировать `/app` и `/app/tasks/[id]` новой задачи.

**Текущее состояние:** Работает; при высокой нагрузке можно оптимизировать в отдельную функцию.

---

## Что НЕ вошло в Фазу 2

Согласно плану MVP, в этом цикле не реализованы:

- **F002/F003 — Создание запросов:** выбор позиций → draft request → выбор поставщиков → отправка (Фаза 3)
- **Счётчики запросов на задаче:** пока `0/0/0` (зависят от F002)
- **Автоматизация таймера:** 10 календарных дней, архивация (Фаза 7)
- **Уведомления:** email opt-in, очередь (Фаза 7.5)
- **Ответы поставщиков:** форма ответа, версии ответа (Фаза 4)
- **Канбан и фильтры:** доски снабженца и поставщика (Фаза 6)

---

## Метрики

| Метрика | Значение |
|---------|----------|
| **Задач завершено** | 9 / 9 (100%) |
| **Приоритет** | 2× Critical, 7× High |
| **Созданных файлов** | 12 (миграции, парсер, UI компоненты) |
| **Изменённых файлов** | 3 (page.tsx, layout.tsx, package.json) |
| **Строк кода (приблизительно)** | ~1200+ (SQL, TypeScript, React, тесты) |
| **Unit-тестов** | 35 (все pass) |
| **Build статус** | ✅ Успешная (exit 0) |
| **Lint статус** | ✅ Чисто (0 ошибок) |
| **Code Review** | ✅ APPROVE (исправлены замечания) |

---

## Известная задолженность

### Non-blocking заметки

1. **Множественный `createAdminClient()`** в `createTask` — работает, но можно оптимизировать в Фазе 3
2. **`revalidatePath("/app")`** очищает весь `/app` кэш — достаточно для MVP, оптимизировать при нагрузке
3. **Поиск на списке** — клиентский, работает на загруженном списке; server-side поиск опционален для больших volume

### Blockers (нет)

- Все критерии приёмки выполнены
- Lint/build/тесты зелёные
- Code-ревью APPROVE

---

## Следующий цикл: Фаза 3 (Запросы и отправка)

После Фазы 2:

1. **Создание запросов (F002):** выбор позиций задачи → draft request → превью
2. **Выбор поставщиков (F003):** дерево групп/поставщиков → отправка invite
3. **Счётчики на задаче:** обновить `0/0/0` из реальных запросов
4. **request_suppliers и deadline:** расчёт срока (10 кал. дней)
5. **Карточка запроса:** статусы invite, история ответов

План Фазы 3 будет создан в отдельном документе.

---

## Статус архивирования

- **План цикла:** Готов к архивации (копировать в `ai_docs/develop/plans/archive/`)
- **Tasks state:** Сохранён в `.cursor/workspace/active/orch-2026-06-02-11-23-phase2/tasks.json` (для истории)
- **Рекомендация:** Откомпилировать этот отчёт в PR/commit с комментарием «Фаза 2 (Парсер Bitrix + Задачи) завершена»

---

**Подготовил:** Документер zapros  
**Дата отчёта:** 2026-06-02  
**Ссылка на оркестрацию:** orch-2026-06-02-11-23-phase2

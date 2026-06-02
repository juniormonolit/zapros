# Changelog: 2026-06-02 — Завершение Фазы 2.6: Парсер реального формата + роль `senior_procurement` + модель поставщиков (groundwork)

**Дата:** 2026-06-02  
**Версия:** v0.1.0 (MVP groundwork)  
**Оркестрация:** orch-2026-06-02-14-44-sourcing

## Добавлено

### Парсер

- ✅ Поддержка построчного формата Bitrix (формат B) со строками `Товар - Кол-во Ед - цена - сумма`
- ✅ Автоматический выбор формата (A табличный vs B построчный)
- ✅ Маркеры конца таблицы: `Итого:`, `Цена которую предлагают конкуренты:`
- ✅ Импорт только `name`, `quantity`, `unit` (цены НЕ импортируются)
- ✅ 10 новых юнит-тестов на формат B (всего 45 pass)

### Роль `senior_procurement`

- ✅ Добавлена роль в enum `user_role` между `admin` и `procurement`
- ✅ Маршрут `/sourcing` (заглушка-доска проработки, канбан в Фазе 7.6)
- ✅ Middleware-ограничение доступа по ролям
- ✅ Admin может создавать пользователей с ролью `senior_procurement`

### Модель поставщиков (groundwork)

- ✅ Enum `supplier_sourcing_status` (8 стадий: new, called, clarified, got_price, test_order, approved, working_in_zapros, rejected)
- ✅ Поля таблицы `suppliers`: `sourcing_status`, `works_in_zapros` (флаг), `contact_person`, `phone`, `email`, `notes`, `created_by`
- ✅ Бэкафилл: активные поставщики мигрированы в стадию `working_in_zapros` с флагом `works_in_zapros=true`
- ✅ Индекс на `available_for_selection`: `sourcing_status IN ('approved','working_in_zapros') AND is_active`

### RLS и безопасность

- ✅ Хелпер `is_senior_or_admin()` в БД
- ✅ Политики `suppliers` (select/insert/update/delete) с дифференциацией по ролям
- ✅ Роль `procurement` видит только `available_for_selection` поставщиков
- ✅ Роль `supplier` не имеет доступа к таблице `suppliers`

### Синхронизация `works_in_zapros`

- ✅ БД-триггер `sync_supplier_works_in_zapros` гарантирует консистентность на уровне БД
- ✅ Single source of truth: стадия `sourcing_status` — мастер, флаг — производный
- ✅ Server action `updateSupplier` синхронизирует флаг при смене стадии

### Admin: CRUD поставщиков

- ✅ Минимальная форма: редактирование контактных полей и стадии поставщика
- ✅ Поля UI: контактное лицо, телефон, email, заметки, селект `sourcing_status`
- ✅ Отображение статуса `works_in_zapros` (производно из стадии)

## Тестирование и верификация

- ✅ Lint: 0 ошибок
- ✅ Build: успешная сборка (exit 0)
- ✅ Unit-тесты: 45/45 pass (35 старых + 10 новых для формата B)
- ✅ БД: миграции 006, 007, 008 применены успешно
- ✅ RLS: политики работают (procurement видит limited set, supplier нет доступа)
- ✅ Code Review: APPROVE (Critical/High исправлены, Medium вошли в миграцию 008)

## Миграции

- `006_sourcing_supplier_fields.sql` — enum user_role, enum sourcing_status, поля suppliers, бэкафилл, индекс
- `007_suppliers_sourcing_rls.sql` — хелпер is_senior_or_admin(), политики suppliers (идемпотентны)
- `008_sync_supplier_works_in_zapros.sql` — триггер синхронизации works_in_zapros (укрепление)

## Что НЕ вошло в этот релиз

- Канбан-UI `/sourcing` (drag&drop, разрешённые переходы) — Фаза 7.6
- Выбор поставщиков в запросах (дерево групп, отправка) — Фаза 3
- Провижининг аккаунта поставщика — будущие фазы
- Номенклатуры и история цен (только швы в data-model)

## Известные заметки (Low, не блокируют)

- **raw_paste содержит цены** — не показывать поставщикам (реализуется в Фазе 3, передавать только name/quantity/unit)
- **Эвристика формата B** — базируется на маркерах и разделителе; на нестандартных пейстах может ошибиться (graceful)
- **Имя с ` - ` обрезается** — редко; требует формат-ориентированного парса (будущие версии)

## Связанные документы

- **Отчёт:** `ai_docs/develop/reports/2026-06-02-phase2.6-sourcing-groundwork-report.md`
- **План:** `ai_docs/develop/plans/2026-06-02-phase2.6-sourcing-groundwork.md`
- **Архитектура:** `ai_docs/develop/architecture/data-model.md` (обновлена: триггер БД, RLS)
- **Фишер:** `ai_docs/develop/features/F010-supplier-sourcing.md` (обновлена: groundwork завершён)

## Что готово для Фазы 3

- Модель `suppliers` с полями и RLS
- Правило `available_for_selection`: `sourcing_status IN ('approved','working_in_zapros') AND is_active`
- Правило `can_receive_system_request`: `works_in_zapros = true`
- Парсер поддерживает оба формата A и B
- RLS: `procurement` видит только готовых поставщиков

## Метрики

| Метрика | Значение |
|---------|----------|
| Задач завершено | 7/7 (100%) |
| Миграций | 3 (006, 007, 008) |
| Новых файлов | 5 |
| Обновлённых файлов | 9 |
| Строк кода | ~800–1000 |
| Unit-тестов | 45 (все pass) |
| Build статус | ✅ Успешно |
| Lint статус | ✅ Чисто (0 ошибок) |
| Code Review | ✅ APPROVE |

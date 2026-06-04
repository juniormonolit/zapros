# План: Фаза 7.7 — Организация поставщика (F012)

**Дата:** 2026-06-04  
**Статус:** 🟢 Ready (7.7a — цикл 1)  
**Orchestration:** `orch-2026-06-04-phase7-7-supplier-org`  
**Feature:** [`F012-supplier-organization.md`](../features/F012-supplier-organization.md)  
**Предусловия:** Фазы 0–7, 7.6 ✅  
**Решение procurement:** вариант **A** — read-only для `procurement`; CRUD master-data — `admin` + `senior_procurement`

## Цель фазы

Расширить `suppliers` до модели «организация + команда + точки + автопарк» без регрессии воронки F010 и потока запросов.

## Подфазы (порядок MVP)

| Подфаза | ID | Содержание | Статус |
|---------|-----|------------|--------|
| **7.7a** | F012 | Membership, enums, точки, vehicles, справочники, внутренний UI | ⏳ Текущий цикл |
| **7.7b** | F011 | EAV + правила номенклатур складов | После 7.7a |
| **7.7c** | — | Кабинет supplier_admin (команда, настройки org) | После 7.7a |
| **7.5** | F009 | Уведомления (минимум) | После 7.7 |
| **8** | — | Полировка MVP | После 7.5 |

## 7.7a — Cycle 1 (≤10 задач)

**Scope:** только 7.7a. Не включать 7.7b (EAV), 7.7c (supplier portal).

- [x] **SRC-701:** Миграция enums + колонки `suppliers` (kind, wave_priority, regions, share_team_responses, notification_channels, условия работы) — ✅ Done
- [x] **SRC-702:** Таблица `supplier_members` + backfill из `profiles` + sync `profiles.supplier_id` ↔ membership — ✅ Done
- [x] **SRC-703:** Таблицы `supplier_warehouses`, `supplier_productions`, `supplier_vehicles` — ✅ Done
- [x] **SRC-704:** Справочники `product_categories`, `product_brands` + junction + seed — ✅ Done
- [x] **SRC-705:** RLS и helper `current_user_supplier_id()` через membership; procurement read-only (вариант A) — ✅ Done
- [x] **SRC-706:** Server actions: CRUD suppliers (расширенный), members, warehouses, productions, vehicles — ✅ Done
- [ ] **SRC-707:** Адаптировать `provisionSupplierUser` + список поставщиков с фильтрами/поиском — ⏳ Pending
- [ ] **SRC-708:** UI `/admin/suppliers` — таблица, колонки ТЗ; доступ senior_procurement — ⏳ Pending
- [ ] **SRC-709:** UI `/admin/suppliers/[id]` — вкладки (основное, контакты/аккаунты, склады, производства, автопарк, условия; документы — stub) — ⏳ Pending
- [ ] **SRC-710:** Unit-тесты (policy/helpers, фильтры) + регрессия F010/F003/F004 — ⏳ Pending

### Детализация по задачам

| ID | Задачи плана (legacy) | Файлы / зона |
|----|----------------------|--------------|
| SRC-701 | 7.7a.1, 7.7a.2 | `supabase/migrations/018_supplier_org_enums.sql` ✅ |
| SRC-702 | 7.7a.3, 7.7a.8 | `supabase/migrations/019_supplier_members.sql` ✅ |
| SRC-703 | 7.7a.4, 7.7a.5 | `supabase/migrations/020_supplier_sites_and_vehicles.sql` ✅ |
| SRC-704 | 7.7a.6 | `supabase/migrations/021_product_categories_brands.sql` ✅ |
| SRC-705 | 7.7a.7 | RLS policies, SQL helpers |
| SRC-706 | 7.7a.9 | `src/actions/suppliers/*` (или аналог в проекте) |
| SRC-707 | 7.7a.10, 7.7a.11 | provisioning + list query/filters |
| SRC-708 | 7.7a.12, 7.7a.14 | `src/app/(admin)/admin/suppliers/` |
| SRC-709 | 7.7a.13 | `src/app/(admin)/admin/suppliers/[id]/` |
| SRC-710 | 7.7a.15, 7.7a.16 | `*.test.ts`, manual checklist |

## Dependencies Graph

```text
SRC-701 → SRC-702 → SRC-703 → SRC-704 → SRC-705 → SRC-706 → SRC-707 → SRC-708 → SRC-709 → SRC-710
```

## Зависимости (внешние)

```text
7.6 provisioning ──► 7.7a membership (SRC-702, SRC-707)
F010 sourcing_status ──► без изменений
F003 request_supplier ──► supplier_id на org, не на user
```

## Критерии готовности 7.7a

См. acceptance criteria в F012 + `npm run build`, тесты, manual checklist из отчёта 7.6 (проработка → working_in_zapros → invite → ответ).

## Не в 7.7a

- Волновая рассылка (авто)
- EAV (7.7b)
- Supplier portal team UI (7.7c)
- Уведомления F009

## Следующий шаг

```text
/orchestrate execute orch-2026-06-04-phase7-7-supplier-org
```

Первая задача: **SRC-701**.

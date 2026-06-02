# zapros — документация проекта

**Версия спецификации:** 2026-06-01  
**Стек:** Next.js 15 (App Router) + TypeScript + Supabase + Tailwind + shadcn/ui

## Назначение

**zapros** — приложение для отдела снабжения: публикация запросов поставщикам, сбор ответов (цены, сроки, наличие), канбан и исходы (победа / брак с причиной). Данные задач импортируются из Bitrix24 через copy-paste.

## Роли

| Роль | Код | Описание |
|------|-----|----------|
| Администратор | `admin` | Один аккаунт: всё видит, создаёт пользователей, настройки |
| Снабженец | `procurement` | Свои задачи и запросы, все ответы по своим запросам |
| Поставщик | `supplier` | Только назначенные запросы, без чужих ответов |

## Навигация

### Архитектура

- [Обзор системы](develop/architecture/zapros-overview.md)
- [Модель данных](develop/architecture/data-model.md)
- [Auth и RLS](develop/architecture/auth-rls.md)
- [Статусы и переходы](develop/architecture/status-machines.md)

### Фичи

| ID | Документ |
|----|----------|
| F001 | [Bitrix paste и задачи](develop/features/F001-bitrix-paste-and-tasks.md) |
| F002 | [Создание запроса из задачи](develop/features/F002-create-request-from-task.md) |
| F003 | [Дерево поставщиков и приглашения](develop/features/F003-supplier-tree-and-invites.md) |
| F004 | [Варианты ответа поставщика](develop/features/F004-supplier-response-variants.md) |
| F005 | [Канбан и фильтры](develop/features/F005-kanban-and-filters.md) |
| F006 | [Треды и события](develop/features/F006-threads-and-events.md) |
| F007 | [Победа, брак, таймер](develop/features/F007-win-reject-timer.md) |
| F008 | [Админ и настройки](develop/features/F008-admin-settings.md) |
| F009 | [Уведомления](develop/features/F009-notifications.md) |

### План и дизайн

- [План MVP](develop/plans/2026-06-01-mvp.md)
- [UX канбана и фильтров](design/kanban-and-filters-ux.md)

## Переменные окружения

```env
PUBLIC_SUPABASE_URL=
PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=   # только сервер, без префикса PUBLIC_
```

## Вне MVP

Файлы, аналитика, экспорт Excel, API-интеграция Bitrix, email/push-уведомления, снятие победителя.

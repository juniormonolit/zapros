# Changelog: миграция на Yandex PostgreSQL

**Дата:** 2026-06-04

- Удалена зависимость от Supabase Auth и SDK.
- Добавлена native auth (`auth.users`, bcrypt, JWT cookie).
- Данные и RLS через `pg` на Yandex Managed PostgreSQL.
- Документация: `develop/architecture/database-yandex.md`, отчёт `develop/reports/2026-06-04-yandex-migration.md`.
- Шаблон production env: `env.production.example`.

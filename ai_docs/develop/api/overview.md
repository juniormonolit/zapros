# API overview (MVP)

**Дата:** 2026-06-01

MVP использует **Next.js Server Actions** и Supabase client с RLS. Отдельного REST API нет.

## Server Actions (план)

| Action | Роль | Описание |
|--------|------|----------|
| `parseBitrixPaste` | procurement | Парсинг paste |
| `createTask` | procurement | Создание задачи |
| `createRequestDraft` | procurement | Черновик запроса |
| `sendRequest` | procurement | Отправка + invites |
| `addSupplierToRequest` | procurement | Новый invite |
| `submitResponseVersion` | supplier | Ответ / новая версия |
| `postThreadMessage` | procurement, supplier | Сообщение в треде |
| `sendSignal` | procurement | Быстрый сигнал |
| `selectWinner` | procurement | Победа + брак остальных |
| `closeAsLost` | procurement | Брак без победителя |
| `adminInviteUser` | admin | Invite |
| `adminUpsertSupplier` | admin | CRUD поставщиков |

## Cron / Edge

| Endpoint | Описание |
|----------|----------|
| `POST /api/cron/expire-invites` | Таймер без ответа (secret header) |

## Realtime (optional)

- Channel: `request_events:request_supplier_id=eq.{id}`

## Типы

Генерировать из Supabase: `supabase gen types typescript`

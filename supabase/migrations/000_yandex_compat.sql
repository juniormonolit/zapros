-- Migration 000: minimal Supabase auth stubs for bare PostgreSQL (Yandex MPG).
-- Run once before 001_enums_profiles.sql.
--
-- Roles `authenticated` / `anon` cannot be created by zapros_migrate on Yandex.
-- Run scripts/yandex-bootstrap-roles.sql once as the database owner (Web SQL / owner URL).

create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key,
  email text,
  created_at timestamptz not null default now()
);

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

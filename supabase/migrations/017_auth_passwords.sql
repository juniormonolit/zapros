-- Migration 017: native auth on auth.users (no Supabase Auth).
-- Adds password storage and unique email for login.

alter table auth.users
  add column if not exists encrypted_password text;

create unique index if not exists auth_users_email_lower_key
  on auth.users (lower(email))
  where email is not null;

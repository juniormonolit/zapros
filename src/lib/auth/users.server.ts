import "server-only";

import { randomUUID } from "node:crypto";

import { getPool } from "@/lib/db/pool";
import { hashPassword } from "@/lib/auth/password";

export interface AuthUserRow {
  id: string;
  email: string;
  encrypted_password: string | null;
}

export async function findUserByEmail(
  email: string,
): Promise<AuthUserRow | null> {
  const pool = getPool();
  const { rows } = await pool.query<AuthUserRow>(
    `
    select id, email, encrypted_password
    from auth.users
    where lower(email) = lower($1)
    limit 1
    `,
    [email],
  );
  return rows[0] ?? null;
}

export async function findUserById(id: string): Promise<AuthUserRow | null> {
  const pool = getPool();
  const { rows } = await pool.query<AuthUserRow>(
    `
    select id, email, encrypted_password
    from auth.users
    where id = $1
    limit 1
    `,
    [id],
  );
  return rows[0] ?? null;
}

export async function listAuthUsers(): Promise<
  { id: string; email: string | null }[]
> {
  const pool = getPool();
  const { rows } = await pool.query<{ id: string; email: string | null }>(
    `select id, email from auth.users order by created_at asc`,
  );
  return rows;
}

export async function createAuthUser(params: {
  email: string;
  password: string;
}): Promise<{ id: string }> {
  const pool = getPool();
  const id = randomUUID();
  const encrypted = await hashPassword(params.password);

  await pool.query(
    `
    insert into auth.users (id, email, encrypted_password)
    values ($1, lower($2), $3)
    `,
    [id, params.email, encrypted],
  );

  return { id };
}

export async function deleteAuthUser(id: string): Promise<void> {
  const pool = getPool();
  await pool.query(`delete from auth.users where id = $1`, [id]);
}

export async function emailExists(email: string): Promise<boolean> {
  const row = await findUserByEmail(email);
  return row != null;
}

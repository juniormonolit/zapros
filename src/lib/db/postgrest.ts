import "server-only";

import type pg from "pg";

import { withDbSession } from "@/lib/db/session";
import type { DbFilter, DbOrder, DbResult } from "@/lib/db/types";

const TABLE_IDENT = /^[a-z_][a-z0-9_]*$/;
const COLUMN_IDENT = /^[a-z_*][a-z0-9_*, ]*$/i;

function quoteIdent(name: string): string {
  if (!TABLE_IDENT.test(name)) {
    throw new Error(`Invalid SQL identifier: ${name}`);
  }
  return `"${name}"`;
}

function parseColumns(select: string): string[] {
  if (select.includes("(") || select.includes("!")) {
    throw new Error(
      `Nested PostgREST selects are not supported. Use src/lib/db/queries/* helpers. Got: ${select}`,
    );
  }
  return select.split(",").map((c) => c.trim()).filter(Boolean);
}

function buildWhere(filters: DbFilter[], params: unknown[]): string {
  const parts: string[] = [];
  for (const f of filters) {
    if (f.kind === "eq") {
      params.push(f.value);
      parts.push(`${quoteIdent(f.column)} = $${params.length}`);
    } else if (f.kind === "in") {
      if (f.values.length === 0) {
        parts.push("false");
        continue;
      }
      const placeholders = f.values.map((v) => {
        params.push(v);
        return `$${params.length}`;
      });
      parts.push(`${quoteIdent(f.column)} in (${placeholders.join(", ")})`);
    } else if (f.kind === "not_null") {
      parts.push(`${quoteIdent(f.column)} is not null`);
    } else if (f.kind === "is_null") {
      parts.push(`${quoteIdent(f.column)} is null`);
    }
  }
  return parts.length > 0 ? ` where ${parts.join(" and ")}` : "";
}

type MutationMode = "insert" | "update" | "upsert" | "delete" | null;

import type { DbRow } from "@/lib/db/types";

export class QueryBuilder implements PromiseLike<DbResult<DbRow | DbRow[] | null>> {
  private readonly userId: string | undefined;
  private filters: DbFilter[] = [];
  private orders: DbOrder[] = [];
  private limitValue: number | null = null;
  private columns = "*";
  private countOnly = false;
  private headOnly = false;
  private singleRow = false;
  private maybeSingleRow = false;
  private mutation: MutationMode = null;
  private mutationPayload: Record<string, unknown> | Record<string, unknown>[] | null =
    null;
  private upsertOnConflict: string | null = null;
  private ignoreDuplicates = false;
  private returningColumns: string | null = null;

  constructor(userId: string | undefined, private readonly table: string) {
    this.userId = userId;
    if (!TABLE_IDENT.test(table)) {
      throw new Error(`Invalid table name: ${table}`);
    }
  }

  select(
    columns = "*",
    options?: { count?: "exact"; head?: boolean },
  ): this {
    if (this.mutation && !this.returningColumns) {
      this.returningColumns = columns;
      return this;
    }
    this.columns = columns;
    if (options?.count === "exact") this.countOnly = true;
    if (options?.head === true) this.headOnly = true;
    return this;
  }

  insert(payload: Record<string, unknown> | Record<string, unknown>[]): this {
    this.mutation = "insert";
    this.mutationPayload = payload;
    return this;
  }

  update(payload: Record<string, unknown>): this {
    this.mutation = "update";
    this.mutationPayload = payload;
    return this;
  }

  upsert(
    payload: Record<string, unknown> | Record<string, unknown>[],
    options?: { onConflict?: string; ignoreDuplicates?: boolean },
  ): this {
    this.mutation = "upsert";
    this.mutationPayload = payload;
    this.upsertOnConflict = options?.onConflict ?? null;
    this.ignoreDuplicates = options?.ignoreDuplicates ?? false;
    return this;
  }

  delete(): this {
    this.mutation = "delete";
    return this;
  }

  eq(column: string, value: unknown): this {
    this.filters.push({ kind: "eq", column, value });
    return this;
  }

  in(column: string, values: unknown[]): this {
    this.filters.push({ kind: "in", column, values });
    return this;
  }

  not(column: string, operator: string, value: unknown): this {
    if (operator === "is" && value === null) {
      this.filters.push({ kind: "not_null", column });
    }
    return this;
  }

  order(
    column: string,
    options?: { ascending?: boolean; nullsFirst?: boolean },
  ): this {
    this.orders.push({
      column,
      ascending: options?.ascending ?? true,
      nullsFirst: options?.nullsFirst,
    });
    return this;
  }

  limit(n: number): this {
    this.limitValue = n;
    return this;
  }

  single(): this {
    this.singleRow = true;
    this.limitValue = 1;
    return this;
  }

  maybeSingle(): this {
    this.maybeSingleRow = true;
    this.limitValue = 1;
    return this;
  }

  then<TResult1 = DbResult<DbRow | DbRow[] | null>, TResult2 = never>(
    onfulfilled?:
      | ((
          value: DbResult<DbRow | DbRow[] | null>,
        ) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  private async execute(): Promise<DbResult<DbRow | DbRow[] | null>> {
    return withDbSession(this.userId, async (client) => {
      try {
        if (this.mutation) {
          return await this.executeMutation(client);
        }
        return await this.executeSelect(client);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const code =
          err && typeof err === "object" && "code" in err
            ? String((err as { code: string }).code)
            : undefined;
        return { data: null, error: { message, code } };
      }
    });
  }

  private async executeSelect(
    client: pg.PoolClient,
  ): Promise<DbResult<DbRow | DbRow[] | null>> {
    const params: unknown[] = [];
    const tableSql = `public.${quoteIdent(this.table)}`;
    const where = buildWhere(this.filters, params);

    if (this.countOnly) {
      const sql = `select count(*)::int as c from ${tableSql}${where}`;
      const result = await client.query(sql, params);
      const count = result.rows[0]?.c ?? 0;
      return {
        data: this.headOnly ? null : count,
        error: null,
        count,
      };
    }

    const cols = parseColumns(this.columns);
    for (const col of cols) {
      if (!COLUMN_IDENT.test(col)) {
        throw new Error(`Invalid column in select: ${col}`);
      }
    }
    const colSql =
      cols[0] === "*" ? "*" : cols.map((c) => quoteIdent(c)).join(", ");

    let sql = `select ${colSql} from ${tableSql}${where}`;

    if (this.orders.length > 0) {
      const orderSql = this.orders
        .map((o) => {
          const dir = o.ascending ? "asc" : "desc";
          const nulls =
            o.nullsFirst === undefined
              ? ""
              : o.nullsFirst
                ? " nulls first"
                : " nulls last";
          return `${quoteIdent(o.column)} ${dir}${nulls}`;
        })
        .join(", ");
      sql += ` order by ${orderSql}`;
    }

    if (this.limitValue != null) {
      params.push(this.limitValue);
      sql += ` limit $${params.length}`;
    }

    const result = await client.query(sql, params);
    const rows = result.rows as DbRow[];

    if (this.singleRow || this.maybeSingleRow) {
      if (rows.length === 0) {
        if (this.maybeSingleRow) return { data: null, error: null };
        return {
          data: null,
          error: { message: "Row not found", code: "PGRST116" },
        };
      }
      if (rows.length > 1 && this.singleRow) {
        return {
          data: null,
          error: { message: "Multiple rows returned", code: "PGRST116" },
        };
      }
      return { data: rows[0] ?? null, error: null };
    }

    return { data: rows, error: null };
  }

  private async executeMutation(
    client: pg.PoolClient,
  ): Promise<DbResult<DbRow | DbRow[] | null>> {
    const params: unknown[] = [];
    const tableSql = `public.${quoteIdent(this.table)}`;
    const where = buildWhere(this.filters, params);
    const returning = this.returningColumns
      ? ` returning ${parseColumns(this.returningColumns)
          .map((c) => quoteIdent(c))
          .join(", ")}`
      : "";

    if (this.mutation === "delete") {
      const sql = `delete from ${tableSql}${where}${returning}`;
      const result = await client.query(sql, params);
      return { data: result.rows as DbRow[], error: null };
    }

    const rows = Array.isArray(this.mutationPayload)
      ? this.mutationPayload
      : [this.mutationPayload!];
    if (rows.length === 0) return { data: [] as DbRow[], error: null };

    const keys = Object.keys(rows[0]!);
    const colSql = keys.map((k) => quoteIdent(k)).join(", ");

    if (this.mutation === "insert" || this.mutation === "upsert") {
      const valueGroups: string[] = [];
      for (const row of rows) {
        const placeholders = keys.map((key) => {
          params.push(row[key]);
          return `$${params.length}`;
        });
        valueGroups.push(`(${placeholders.join(", ")})`);
      }

      let sql = `insert into ${tableSql} (${colSql}) values ${valueGroups.join(", ")}`;

      if (this.mutation === "upsert" && this.upsertOnConflict) {
        const conflictCols = this.upsertOnConflict
          .split(",")
          .map((c) => quoteIdent(c.trim()))
          .join(", ");
        if (this.ignoreDuplicates) {
          sql += ` on conflict (${conflictCols}) do nothing`;
        } else {
          const updates = keys
            .filter((k) => !this.upsertOnConflict!.split(",").map((s) => s.trim()).includes(k))
            .map((k) => `${quoteIdent(k)} = excluded.${quoteIdent(k)}`)
            .join(", ");
          sql += ` on conflict (${conflictCols}) do update set ${updates}`;
        }
      }

      sql += returning;
      const result = await client.query(sql, params);
      const out = result.rows as DbRow[];
      if (this.singleRow || this.maybeSingleRow) {
        return {
          data: out[0] ?? null,
          error: out.length === 0 && this.singleRow
            ? { message: "Row not found", code: "PGRST116" }
            : null,
        };
      }
      return { data: out, error: null };
    }

    if (this.mutation === "update") {
      const setParts = keys.map((key) => {
        params.push((this.mutationPayload as Record<string, unknown>)[key]);
        return `${quoteIdent(key)} = $${params.length}`;
      });
      const sql = `update ${tableSql} set ${setParts.join(", ")}${where}${returning}`;
      const result = await client.query(sql, params);
      return { data: result.rows as DbRow[], error: null };
    }

    return { data: null, error: { message: "Unknown mutation" } };
  }
}

export function fromTable(userId: string | undefined, table: string): QueryBuilder {
  return new QueryBuilder(userId, table);
}

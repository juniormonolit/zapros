/** PostgREST-compatible result shape used across the app. */
export interface DbResult<T> {
  data: T | null;
  error: { message: string; code?: string } | null;
  count?: number | null;
}

export type DbFilter =
  | { kind: "eq"; column: string; value: unknown }
  | { kind: "in"; column: string; values: unknown[] }
  | { kind: "cs"; column: string; value: unknown[] }
  | { kind: "not_null"; column: string }
  | { kind: "is_null"; column: string };

export type DbOrder = {
  column: string;
  ascending: boolean;
  nullsFirst?: boolean;
};

export type DbRow = Record<string, unknown>;

/** Normalizes select results to an array of rows. */
export function ensureRows(
  data: DbRow | DbRow[] | null | undefined,
): DbRow[] {
  if (!data) return [];
  return Array.isArray(data) ? data : [data];
}

export function ensureRow(
  data: DbRow | DbRow[] | null | undefined,
): DbRow | null {
  if (!data) return null;
  return Array.isArray(data) ? (data[0] ?? null) : data;
}

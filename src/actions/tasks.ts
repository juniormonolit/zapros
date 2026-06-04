"use server";

import { revalidatePath } from "next/cache";

import { getProfile, type Profile } from "@/lib/auth";
import type { ParsedTaskPreview } from "@/lib/parser/bitrix";
import { ensureRow, ensureRows } from "@/lib/db/types";
import { createAdminClient } from "@/lib/admin-client";
import { createClient } from "@/lib/app-client";

/** Postgres unique-violation error code, surfaced via PostgREST. */
const UNIQUE_VIOLATION = "23505";

/** Placeholder a Bitrix URL template must contain to be filled with a task id. */
const TASK_ID_PLACEHOLDER = "{task_id}";

/** Roles allowed to create procurement tasks. */
const TASK_AUTHORS = new Set(["procurement", "admin"]);

/**
 * Minimal shape of a `bitrix_group_settings` row needed to build a task URL.
 * Kept narrow so {@link buildBitrixUrl} stays a pure, testable function.
 */
export interface BitrixUrlSetting {
  name: string;
  url_template: string;
  is_active: boolean;
}

/**
 * Discriminated result of {@link createTask}, shaped for the preview UI
 * (BTX-005 / BTX-008): on success it carries the new task id; on failure it
 * carries a user-facing message and, for the duplicate case, the id of the
 * existing task so the UI can link to it.
 */
export type CreateTaskResult =
  | { ok: true; taskId: string }
  | { ok: false; error: string; duplicateTaskId?: string };

/**
 * Build the Bitrix task URL for a given category.
 *
 * Pure function: finds the active setting whose `name` matches `category` and
 * substitutes the task number for the `{task_id}` placeholder in its template.
 * Returns `null` when there is no matching active setting, so the caller can
 * store an empty URL and let the user pick one later.
 */
function buildBitrixUrl(
  category: string | null,
  taskNumber: number,
  settings: readonly BitrixUrlSetting[],
): string | null {
  if (!category) return null;

  const setting = settings.find(
    (item) => item.is_active && item.name === category,
  );
  if (!setting) return null;

  return setting.url_template.split(TASK_ID_PLACEHOLDER).join(String(taskNumber));
}

function fail(error: string, duplicateTaskId?: string): CreateTaskResult {
  return duplicateTaskId
    ? { ok: false, error, duplicateTaskId }
    : { ok: false, error };
}

/**
 * Validates the user-edited preview before persisting. Returns an error message
 * (string) when invalid, or the verified `bitrix_task_number` when valid.
 *
 * Note: `parsed.items` is the array the user reviewed, so we validate against it
 * (a non-empty list with at least one named line).
 */
function validatePreview(parsed: ParsedTaskPreview): string | number {
  const number = parsed.bitrix_task_number;
  if (number === null || !Number.isInteger(number) || number <= 0) {
    return "Укажите корректный номер задачи Bitrix (целое число больше 0).";
  }

  const namedItems = parsed.items.filter((item) => item.name.trim().length > 0);
  if (namedItems.length === 0) {
    return "Добавьте хотя бы одну позицию с названием.";
  }

  if (parsed.delivery_date !== null && !isValidIsoDate(parsed.delivery_date)) {
    return "Дата поставки указана в неверном формате.";
  }

  return number;
}

/** True when `value` is a valid ISO `YYYY-MM-DD` calendar date. */
function isValidIsoDate(value: string): boolean {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;

  const [, year, month, day] = match;
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return false;

  return (
    date.getUTCFullYear() === Number(year) &&
    date.getUTCMonth() + 1 === Number(month) &&
    date.getUTCDate() === Number(day)
  );
}

/**
 * Persist a reviewed Bitrix task preview as a `tasks` row plus its `task_items`.
 *
 * Authorization, input validation and duplicate detection run before any write.
 * supabase-js has no client-side transactions, so the items insert is made
 * atomic best-effort: if it fails, the just-created task is deleted before the
 * error is returned.
 */
export async function createTask(
  parsed: ParsedTaskPreview,
): Promise<CreateTaskResult> {
  const profile = await getProfile();
  if (!profile || !TASK_AUTHORS.has(profile.role)) {
    return fail("Недостаточно прав для создания задачи.");
  }

  const validated = validatePreview(parsed);
  if (typeof validated === "string") {
    return fail(validated);
  }
  const bitrixTaskNumber = validated;

  const supabase = await createClient();

  // Duplicate check runs system-wide (admin client, bypassing RLS) so a number
  // taken by *another* procurement user is detected before we attempt to write.
  const existing = await findTaskByNumberPrivileged(bitrixTaskNumber);
  if (existing) {
    return duplicateOutcome(bitrixTaskNumber, existing, profile);
  }

  const { data: settings, error: settingsError } = await supabase
    .from("bitrix_group_settings")
    .select("name, url_template, is_active");
  if (settingsError) {
    return fail("Не удалось загрузить настройки Bitrix.");
  }

  const bitrixUrl = buildBitrixUrl(
    parsed.category,
    bitrixTaskNumber,
    ensureRows(settings) as unknown as BitrixUrlSetting[],
  );

  const { data: insertedData, error: insertError } = await supabase
    .from("tasks")
    .insert({
      created_by: profile.id,
      bitrix_task_number: bitrixTaskNumber,
      bitrix_url: bitrixUrl,
      title: parsed.title,
      manager_name: parsed.manager_name,
      delivery_address: parsed.delivery_address,
      payment_form: parsed.payment_form,
      delivery_date: parsed.delivery_date,
      category: parsed.category,
      purposes: parsed.purposes,
      deal_title: parsed.deal_title,
      requested_at: parsed.requested_at,
      raw_paste: parsed.raw_paste,
    })
    .select("id")
    .single();

  const inserted = ensureRow(insertedData);
  if (insertError || !inserted) {
    if (insertError?.code === UNIQUE_VIOLATION) {
      const duplicate = await findTaskByNumberPrivileged(bitrixTaskNumber);
      if (duplicate) return duplicateOutcome(bitrixTaskNumber, duplicate, profile);
    }
    return fail("Не удалось создать задачу.");
  }

  const taskId = String(inserted.id);

  const itemsError = await insertTaskItems(supabase, taskId, parsed);
  if (itemsError) {
    // Rollback must use the admin client: the RLS `tasks_delete` policy is
    // admin-only, so a procurement user's cookie-bound client cannot delete
    // the just-created task and would silently leave it orphaned.
    const admin = createAdminClient();
    const { error: rollbackError } = await admin
      .from("tasks")
      .delete()
      .eq("id", taskId);
    if (rollbackError) {
      // Log message only (no service-role key / connection details).
      console.error(
        `Откат осиротевшей задачи ${taskId} не удался: ${rollbackError.message}`,
      );
      return fail(
        "Не удалось сохранить позиции задачи; задача могла остаться. Обратитесь к администратору.",
      );
    }
    return fail("Не удалось сохранить позиции задачи.");
  }

  revalidatePath("/app");
  return { ok: true, taskId };
}

/** Minimal client surface used by the helpers, derived from `createClient`. */
type AppDbClient = Awaited<ReturnType<typeof createClient>>;

/** An existing task discovered during duplicate detection, with its owner. */
interface ExistingTask {
  id: string;
  createdBy: string;
}

/**
 * Look up an existing task by its Bitrix number across the whole system.
 *
 * Uses the privileged admin client to bypass RLS so that a number already taken
 * by *another* procurement user is detected (a cookie-bound client would not see
 * that row and the check would falsely pass). Returns the task id and its owner,
 * or `null` when the number is free.
 */
async function findTaskByNumberPrivileged(
  bitrixTaskNumber: number,
): Promise<ExistingTask | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("tasks")
    .select("id, created_by")
    .eq("bitrix_task_number", bitrixTaskNumber)
    .maybeSingle();

  const row = ensureRow(data);
  return row
    ? { id: String(row.id), createdBy: String(row.created_by) }
    : null;
}

/**
 * Maps a detected duplicate to a {@link CreateTaskResult}. When the current user
 * owns the task (or is an admin) the result carries `duplicateTaskId` so the UI
 * can link to it; otherwise the task is inaccessible to the user, so we return a
 * clear message without a (dead) link.
 */
function duplicateOutcome(
  bitrixTaskNumber: number,
  existing: ExistingTask,
  profile: Profile,
): CreateTaskResult {
  const isAccessible =
    existing.createdBy === profile.id || profile.role === "admin";

  if (isAccessible) {
    return duplicateResult(bitrixTaskNumber, existing.id);
  }

  return fail(
    `Задача с номером ${bitrixTaskNumber} уже существует (создана другим пользователем).`,
  );
}

function duplicateResult(
  bitrixTaskNumber: number,
  duplicateTaskId: string,
): CreateTaskResult {
  return fail(
    `Задача с номером ${bitrixTaskNumber} уже существует.`,
    duplicateTaskId,
  );
}

/**
 * Insert the reviewed line items for a task. Only named lines are kept (matching
 * the create-time validation); `sort_order` follows the reviewed order and
 * `line_status` falls back to its column default. Returns `true` on error.
 */
async function insertTaskItems(
  supabase: AppDbClient,
  taskId: string,
  parsed: ParsedTaskPreview,
): Promise<boolean> {
  const rows = parsed.items
    .filter((item) => item.name.trim().length > 0)
    .map((item, index) => ({
      task_id: taskId,
      sort_order: index,
      name: item.name.trim(),
      quantity: item.quantity,
      unit: item.unit,
      comment: item.comment,
    }));

  const { error } = await supabase.from("task_items").insert(rows);
  return Boolean(error);
}

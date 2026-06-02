/**
 * Pure parser for Bitrix24 task "paste" text.
 *
 * Turns the raw text a procurement specialist copies out of Bitrix into a
 * structured {@link ParsedTaskPreview} that the UI / server actions can edit
 * and persist. The function is intentionally side-effect free and
 * deterministic: no DB, no network, no `Date.now()`. It never throws — missing
 * or malformed fields resolve to `null` / empty values so the preview form can
 * still render and let the user fix things by hand.
 *
 * See `ai_docs/develop/features/F001-bitrix-paste-and-tasks.md`.
 */

export type PaymentForm = "cash" | "non_cash";

/** A single product row parsed from the "Продукция из товаров" table. */
export interface ParsedTaskItem {
  /** Product name (column "Товар"). */
  name: string;
  /** Numeric quantity split from the "Кол-во" cell, or `null` if unparseable. */
  quantity: number | null;
  /** Unit of measure split from the "Кол-во" cell (e.g. "шт", "м³"). */
  unit: string | null;
  /** Free-form comment (column "Комментарий"). */
  comment: string | null;
}

/** Structured preview of a Bitrix task, ready for manual review before saving. */
export interface ParsedTaskPreview {
  /** Bitrix task id from "Задача № …". Always a positive integer or `null`. */
  bitrix_task_number: number | null;
  /** Manager name ("Менеджер:"). */
  manager_name: string | null;
  /** Delivery locality ("Населенный пункт:"). */
  delivery_address: string | null;
  /** Purpose of the order ("Для каких целей:"). */
  purposes: string | null;
  /** Payment form ("Форма оплаты:") normalized to `cash` / `non_cash`. */
  payment_form: PaymentForm | null;
  /** Delivery date ("Дата поставки материала:") as ISO `YYYY-MM-DD`. */
  delivery_date: string | null;
  /** Bitrix project / group name ("Задача в проекте (группе):"). */
  category: string | null;
  /** Deal title ("Сделка:"). */
  deal_title: string | null;
  /** "Сделал запрос снабженцу" timestamp as `YYYY-MM-DDTHH:mm` or `null`. */
  requested_at: string | null;
  /** Human-friendly title (deal title with sensible fallbacks). */
  title: string | null;
  /** Parsed product rows. */
  items: ParsedTaskItem[];
  /** The untouched original paste. */
  raw_paste: string;
}

const PRODUCT_TABLE_START = "Продукция из товаров:";
const PRODUCT_TABLE_END_MARKERS = ["Общая сумма", "добавить чек-лист"];

/** Field separator for the "dash" (format B) product rows: space-hyphen-space. */
const FORMAT_B_FIELD_SEPARATOR = " - ";
/**
 * End-of-table markers for format B. Extends the format A markers with the
 * "Итого:" / "Цена которую предлагают конкуренты:" lines Bitrix prints right
 * after the dash-formatted product list.
 */
const FORMAT_B_END_MARKERS = [
  ...PRODUCT_TABLE_END_MARKERS,
  "Итого:",
  "Цена которую предлагают конкуренты:",
];

/**
 * Parse raw Bitrix paste text into a structured preview.
 *
 * Pure and total: any malformed input degrades to `null` / empty fields
 * instead of throwing.
 */
export function parseBitrixPaste(raw: string): ParsedTaskPreview {
  const text = typeof raw === "string" ? raw : "";
  const lines = text.replace(/\r\n?/g, "\n").split("\n");

  const dealTitle = findFieldValue(lines, "Сделка:");
  const taskNumber = parseTaskNumber(text);

  return {
    bitrix_task_number: taskNumber,
    manager_name: findFieldValue(lines, "Менеджер:"),
    delivery_address: findFieldValue(lines, "Населенный пункт:"),
    purposes: findFieldValue(lines, "Для каких целей:"),
    payment_form: parsePaymentForm(findFieldValue(lines, "Форма оплаты:")),
    delivery_date: parseDate(findFieldValue(lines, "Дата поставки материала:")),
    category: findFieldValue(lines, "Задача в проекте (группе):"),
    deal_title: dealTitle,
    requested_at: parseDateTime(
      findFieldValue(lines, 'Дата "Сделал запрос снабженцу"'),
    ),
    title: buildTitle(dealTitle, taskNumber),
    items: parseProductTable(lines),
    raw_paste: text,
  };
}

/**
 * Find the value associated with a labelled field.
 *
 * Looks for the first line containing `label`. The value is the remainder of
 * that line after the label; if that is empty, the next non-empty line is used
 * (Bitrix sometimes puts the value on the following line).
 */
function findFieldValue(lines: string[], label: string): string | null {
  for (let i = 0; i < lines.length; i++) {
    const idx = lines[i].indexOf(label);
    if (idx === -1) continue;

    const sameLine = lines[i].slice(idx + label.length).trim();
    if (sameLine) return sameLine;

    for (let j = i + 1; j < lines.length; j++) {
      const next = lines[j].trim();
      if (next) return next;
    }
    return null;
  }
  return null;
}

/** Extract the positive integer task number from "Задача № 113153". */
function parseTaskNumber(text: string): number | null {
  const match = text.match(/Задача\s*№\s*(\d+)/);
  if (!match) return null;
  const value = Number.parseInt(match[1], 10);
  return Number.isInteger(value) && value > 0 ? value : null;
}

/** Normalize "Нал" → `cash`, "Безнал" → `non_cash` (case/space insensitive). */
function parsePaymentForm(value: string | null): PaymentForm | null {
  if (!value) return null;
  const normalized = value.toLowerCase().replace(/\s+/g, "");
  if (normalized.includes("безнал")) return "non_cash";
  if (normalized.includes("нал")) return "cash";
  return null;
}

/** Parse `DD.MM.YYYY` into ISO `YYYY-MM-DD`, or `null` if invalid. */
function parseDate(value: string | null): string | null {
  if (!value) return null;
  const match = value.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (!match) return null;
  const [, day, month, year] = match;
  return toIsoDate(year, month, day);
}

/** Parse `DD.MM.YYYY HH:mm` into `YYYY-MM-DDTHH:mm`, or `null` if invalid. */
function parseDateTime(value: string | null): string | null {
  if (!value) return null;
  const match = value.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})\s+(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const [, day, month, year, hour, minute] = match;
  const date = toIsoDate(year, month, day);
  if (!date) return null;
  const h = Number.parseInt(hour, 10);
  const m = Number.parseInt(minute, 10);
  if (h > 23 || m > 59) return null;
  return `${date}T${pad2(h)}:${pad2(m)}`;
}

/** Validate calendar parts and format as ISO date, or `null`. */
function toIsoDate(year: string, month: string, day: string): string | null {
  const y = Number.parseInt(year, 10);
  const m = Number.parseInt(month, 10);
  const d = Number.parseInt(day, 10);
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

function pad2(value: number): string {
  return value.toString().padStart(2, "0");
}

/** Build a sensible task title: deal title, else task number, else null. */
function buildTitle(dealTitle: string | null, taskNumber: number | null): string | null {
  if (dealTitle) return dealTitle;
  if (taskNumber !== null) return `Задача № ${taskNumber}`;
  return null;
}

/**
 * Parse the product table, auto-detecting the Bitrix export format.
 *
 * - Format A (tabular): a tab-separated header row with a "Товар" column exists
 *   after "Продукция из товаров:" — parsed by column index, prices ignored.
 * - Format B (dash): rows like `<Товар> - <Кол-во Ед> - <цена> руб/ед - <сумма> руб`.
 *   Used when no format A header is found (the "Продукция из товаров:" marker may
 *   be present or absent).
 */
function parseProductTable(lines: string[]): ParsedTaskItem[] {
  const startIdx = lines.findIndex((line) => line.includes(PRODUCT_TABLE_START));

  if (startIdx !== -1) {
    const columns = findColumnMapping(lines, startIdx);
    if (columns) return parseTabularFormat(lines, columns);
  }

  return parseDashFormat(lines, startIdx === -1 ? 0 : startIdx + 1);
}

/**
 * Parse format A (tabular): one item per tab-separated data row, mapping only
 * the allowed columns (Товар → name, Кол-во → quantity/unit, Комментарий →
 * comment). Stops at the first end marker.
 */
function parseTabularFormat(lines: string[], columns: ColumnMapping): ParsedTaskItem[] {
  const items: ParsedTaskItem[] = [];
  for (let i = columns.headerIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (isTableEndMarker(line)) break;
    if (!line.includes("\t")) continue;

    const item = buildItem(line.split("\t"), columns);
    if (item) items.push(item);
  }
  return items;
}

/**
 * Parse format B (dash): each product line splits on " - " into
 * `<name> - <quantity unit> - <price> руб/ед - <sum> руб`. Only name and the
 * quantity/unit field are imported; price and sum fields are dropped entirely.
 *
 * The list is anchored on the first line whose second field is a real quantity
 * (starts with a number), which keeps unrelated dash-containing lines out when
 * there is no "Продукция из товаров:" marker. Once anchored, every following
 * dash line is kept (name preserved even if its quantity is unparseable) until
 * an end marker. Total/service lines (Итого, Общая сумма, Цена …) end the table.
 */
function parseDashFormat(lines: string[], fromIdx: number): ParsedTaskItem[] {
  const items: ParsedTaskItem[] = [];
  let started = false;

  for (let i = fromIdx; i < lines.length; i++) {
    const line = lines[i];
    if (isFormatBEndMarker(line)) {
      if (started) break;
      continue;
    }
    if (!line.includes(FORMAT_B_FIELD_SEPARATOR)) continue;

    const fields = line.split(FORMAT_B_FIELD_SEPARATOR);
    const name = fields[0].trim();
    if (!name) continue;

    const { quantity, unit } = parseQuantity(fields.length > 1 ? fields[1].trim() : null);
    // Require a real quantity to start the list; afterwards keep every row.
    if (!started && quantity === null) continue;

    started = true;
    items.push({ name, quantity, unit, comment: null });
  }
  return items;
}

interface ColumnMapping {
  headerIdx: number;
  nameCol: number;
  quantityCol: number;
  commentCol: number;
}

/** Locate the header row and the indices of the columns we import. */
function findColumnMapping(lines: string[], startIdx: number): ColumnMapping | null {
  for (let i = startIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (isTableEndMarker(line)) return null;
    if (!line.includes("\t")) continue;

    const cells = line.split("\t").map((cell) => cell.trim().toLowerCase());
    const nameCol = cells.findIndex((cell) => cell === "товар");
    if (nameCol === -1) continue;

    const quantityCol = cells.findIndex((cell) => cell.startsWith("кол"));
    const commentCol = cells.findIndex((cell) => cell.includes("коммент"));
    return { headerIdx: i, nameCol, quantityCol, commentCol };
  }
  return null;
}

function isTableEndMarker(line: string): boolean {
  return PRODUCT_TABLE_END_MARKERS.some((marker) => line.includes(marker));
}

function isFormatBEndMarker(line: string): boolean {
  return FORMAT_B_END_MARKERS.some((marker) => line.includes(marker));
}

/** Build one product item from a split data row, or `null` if it has no name. */
function buildItem(cells: string[], columns: ColumnMapping): ParsedTaskItem | null {
  const name = cellAt(cells, columns.nameCol);
  if (!name) return null;

  const { quantity, unit } = parseQuantity(cellAt(cells, columns.quantityCol));
  const comment = cellAt(cells, columns.commentCol);

  return { name, quantity, unit, comment };
}

function cellAt(cells: string[], index: number): string | null {
  if (index < 0 || index >= cells.length) return null;
  const value = cells[index].trim();
  return value || null;
}

/**
 * Split a "Кол-во" cell into a numeric quantity and a unit.
 *
 * "20 шт" → `{ quantity: 20, unit: "шт" }`; "1,5 м³" → `{ 1.5, "м³" }`. When no
 * leading number is present the quantity is `null` and the raw text is kept as
 * the unit so nothing is lost.
 */
function parseQuantity(raw: string | null): { quantity: number | null; unit: string | null } {
  if (!raw) return { quantity: null, unit: null };

  const match = raw.match(/^(\d+(?:[.,]\d+)?)\s*(.*)$/);
  if (!match) return { quantity: null, unit: raw };

  const quantity = Number.parseFloat(match[1].replace(",", "."));
  const unit = match[2].trim() || null;
  return { quantity: Number.isFinite(quantity) ? quantity : null, unit };
}

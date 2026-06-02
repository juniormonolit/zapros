import { describe, expect, it } from "vitest";

import { parseBitrixPaste } from "@/lib/parser/bitrix";

/**
 * Tests for the pure Bitrix paste parser.
 *
 * The smoke block proves Vitest runs and the parser works on the reference task
 * (№ 113153, утеплитель). The blocks below give full coverage of the public
 * contract: every field, payment-form normalization, date parsing, table
 * cut-off, price-column isolation, graceful degradation, and quantity/unit
 * edge cases. All fixtures are inline constants so the tests are deterministic.
 */

const SAMPLE_113153 = [
  "Задача № 113153",
  "Сделка: Утеплитель для фасада",
  "Менеджер: Юлия Канищева",
  "Населенный пункт: 15, Лапшинка",
  "Для каких целей: фасад",
  "Форма оплаты: Безнал",
  "Дата поставки материала: 05.05.2026",
  "Задача в проекте (группе): мск_Утеплитель",
  'Дата "Сделал запрос снабженцу" 31.05.2026 13:17',
  "Продукция из товаров:",
  "№\tТовар\tКол-во\tНаша цена\tСумма\tЦена из калькулятора\tЦена конкурента\tКомментарий",
  "1\tУтеплитель ТехноНИКОЛЬ\t20 шт\t100\t2000\t95\t98\tпо акции",
  "2\tКлей для плит\t5 упак\t300\t1500\t290\t310\t",
  "3\tДюбель-зонт\t1000 шт\t2\t2000\t1.8\t2.1\tдлина 100мм",
  "4\tСетка фасадная\t150 м²\t40\t6000\t38\t42\tплотность 160",
  "Общая сумма\t11500",
  "добавить чек-лист",
].join("\n");

describe("parseBitrixPaste", () => {
  it("parses the reference task fields", () => {
    const result = parseBitrixPaste(SAMPLE_113153);

    expect(result.bitrix_task_number).toBe(113153);
    expect(result.manager_name).toBe("Юлия Канищева");
    expect(result.delivery_address).toBe("15, Лапшинка");
    expect(result.payment_form).toBe("non_cash");
    expect(result.delivery_date).toBe("2026-05-05");
    expect(result.category).toBe("мск_Утеплитель");
    expect(result.deal_title).toBe("Утеплитель для фасада");
    expect(result.title).toBe("Утеплитель для фасада");
    expect(result.requested_at).toBe("2026-05-31T13:17");
    expect(result.raw_paste).toBe(SAMPLE_113153);
  });

  it("extracts exactly 4 product rows with name and quantity, ignoring price columns", () => {
    const result = parseBitrixPaste(SAMPLE_113153);

    expect(result.items).toHaveLength(4);
    expect(result.items[0]).toEqual({
      name: "Утеплитель ТехноНИКОЛЬ",
      quantity: 20,
      unit: "шт",
      comment: "по акции",
    });
    expect(result.items[3]).toEqual({
      name: "Сетка фасадная",
      quantity: 150,
      unit: "м²",
      comment: "плотность 160",
    });

    // Price columns must never leak into the parsed items.
    const serialized = JSON.stringify(result.items);
    expect(serialized).not.toContain("2000");
    expect(serialized).not.toContain("11500");
  });

  it("recognizes cash payment and degrades gracefully on empty input", () => {
    expect(parseBitrixPaste("Форма оплаты: Нал").payment_form).toBe("cash");

    const empty = parseBitrixPaste("");
    expect(empty.bitrix_task_number).toBeNull();
    expect(empty.payment_form).toBeNull();
    expect(empty.items).toEqual([]);
    expect(empty.raw_paste).toBe("");
  });
});

/**
 * Full reference paste № 113153 as described in F001 — четыре строки товаров,
 * наличная оплата ("Нал" → cash). Every Bitrix price column is present in the
 * table so the test can prove they never leak into the result.
 */
const FULL_113153_CASH = [
  "Задача № 113153",
  "Сделка: Утеплитель для фасада, ул. Лапшинка",
  "Менеджер: Юлия Канищева",
  "Населенный пункт: 15, Лапшинка",
  "Для каких целей: утепление фасада",
  "Форма оплаты: Нал",
  "Дата поставки материала: 05.05.2026",
  "Задача в проекте (группе): мск_Утеплитель",
  'Дата "Сделал запрос снабженцу" 31.05.2026 13:17',
  "Продукция из товаров:",
  "№\tТовар\tКол-во\tНаша цена\tСумма\tЦена из калькулятора\tЦена конкурента\tКомментарий",
  "1\tУтеплитель ТехноНИКОЛЬ\t20 шт\t100\t2000\t95\t98\tпо акции",
  "2\tКлей для плит\t5 упак\t300\t1500\t290\t310\t",
  "3\tГрунтовка глубокого проникновения\t1,5 м³\t450\t675\t440\t460\tпод покраску",
  "4\tСетка фасадная\t150 м²\t40\t6000\t38\t42\tплотность 160",
  "Общая сумма\t10175",
  "добавить чек-лист",
].join("\n");

describe("parseBitrixPaste — full reference example (№ 113153, Нал)", () => {
  it("parses every scalar field per F001", () => {
    const r = parseBitrixPaste(FULL_113153_CASH);

    expect(r.bitrix_task_number).toBe(113153);
    expect(r.manager_name).toBe("Юлия Канищева");
    expect(r.delivery_address).toBe("15, Лапшинка");
    expect(r.purposes).toBe("утепление фасада");
    expect(r.payment_form).toBe("cash");
    expect(r.delivery_date).toBe("2026-05-05");
    expect(r.category).toBe("мск_Утеплитель");
    expect(r.deal_title).toBe("Утеплитель для фасада, ул. Лапшинка");
    expect(r.title).toBe("Утеплитель для фасада, ул. Лапшинка");
    expect(r.requested_at).toBe("2026-05-31T13:17");
    expect(r.raw_paste).toBe(FULL_113153_CASH);
  });

  it("extracts exactly 4 product rows with correct name/quantity/unit/comment", () => {
    const r = parseBitrixPaste(FULL_113153_CASH);

    expect(r.items).toHaveLength(4);
    expect(r.items).toEqual([
      { name: "Утеплитель ТехноНИКОЛЬ", quantity: 20, unit: "шт", comment: "по акции" },
      { name: "Клей для плит", quantity: 5, unit: "упак", comment: null },
      {
        name: "Грунтовка глубокого проникновения",
        quantity: 1.5,
        unit: "м³",
        comment: "под покраску",
      },
      { name: "Сетка фасадная", quantity: 150, unit: "м²", comment: "плотность 160" },
    ]);
  });

  it("never leaks price columns (Наша цена, Сумма, Цена из калькулятора, Цена конкурента)", () => {
    const r = parseBitrixPaste(FULL_113153_CASH);
    const serialized = JSON.stringify(r.items);

    for (const priceLikeValue of ["2000", "1500", "675", "6000", "10175", "310", "460"]) {
      expect(serialized).not.toContain(priceLikeValue);
    }
    // Each item exposes exactly the four allowed keys — nothing more.
    for (const item of r.items) {
      expect(Object.keys(item).sort()).toEqual(["comment", "name", "quantity", "unit"]);
    }
  });
});

describe("parseBitrixPaste — payment form (Нал / Безнал)", () => {
  it.each([
    ["Нал", "cash"],
    ["нал", "cash"],
    ["НАЛ", "cash"],
    ["  Нал  ", "cash"],
    ["Безнал", "non_cash"],
    ["безнал", "non_cash"],
    ["БЕЗНАЛ", "non_cash"],
    ["  Без нал ", "non_cash"],
  ])("normalizes 'Форма оплаты: %s' → %s", (input, expected) => {
    expect(parseBitrixPaste(`Форма оплаты: ${input}`).payment_form).toBe(expected);
  });

  it("returns null for missing or unrecognized payment form", () => {
    expect(parseBitrixPaste("").payment_form).toBeNull();
    expect(parseBitrixPaste("Форма оплаты: картой").payment_form).toBeNull();
  });
});

describe("parseBitrixPaste — date parsing", () => {
  it("converts a valid DD.MM.YYYY delivery date to ISO", () => {
    expect(
      parseBitrixPaste("Дата поставки материала: 05.05.2026").delivery_date,
    ).toBe("2026-05-05");
  });

  it("pads single-digit day and month", () => {
    expect(
      parseBitrixPaste("Дата поставки материала: 5.5.2026").delivery_date,
    ).toBe("2026-05-05");
  });

  it("returns null for missing, malformed, or out-of-range delivery date", () => {
    expect(parseBitrixPaste("").delivery_date).toBeNull();
    expect(
      parseBitrixPaste("Дата поставки материала: завтра").delivery_date,
    ).toBeNull();
    expect(
      parseBitrixPaste("Дата поставки материала: 32.13.2026").delivery_date,
    ).toBeNull();
  });

  it("parses DD.MM.YYYY HH:mm into YYYY-MM-DDTHH:mm for requested_at", () => {
    expect(
      parseBitrixPaste('Дата "Сделал запрос снабженцу" 31.05.2026 13:17').requested_at,
    ).toBe("2026-05-31T13:17");
    expect(
      parseBitrixPaste('Дата "Сделал запрос снабженцу" 1.2.2026 9:05').requested_at,
    ).toBe("2026-02-01T09:05");
  });

  it("returns null for malformed or out-of-range requested_at time", () => {
    expect(parseBitrixPaste("").requested_at).toBeNull();
    expect(
      parseBitrixPaste('Дата "Сделал запрос снабженцу" 31.05.2026').requested_at,
    ).toBeNull();
    expect(
      parseBitrixPaste('Дата "Сделал запрос снабженцу" 31.05.2026 25:00').requested_at,
    ).toBeNull();
  });
});

describe("parseBitrixPaste — product table boundaries", () => {
  it("stops at the 'Общая сумма' marker", () => {
    const paste = [
      "Продукция из товаров:",
      "№\tТовар\tКол-во\tКомментарий",
      "1\tЦемент\t10 мешок\t",
      "Общая сумма\t9999",
      "2\tНе должен попасть\t5 шт\t",
    ].join("\n");

    const r = parseBitrixPaste(paste);
    expect(r.items).toHaveLength(1);
    expect(r.items[0].name).toBe("Цемент");
    expect(JSON.stringify(r.items)).not.toContain("Не должен попасть");
  });

  it("stops at the 'добавить чек-лист' marker", () => {
    const paste = [
      "Продукция из товаров:",
      "№\tТовар\tКол-во\tКомментарий",
      "1\tПесок\t3 м³\t",
      "добавить чек-лист",
      "2\tНе должен попасть\t1 шт\t",
    ].join("\n");

    const r = parseBitrixPaste(paste);
    expect(r.items).toHaveLength(1);
    expect(r.items[0].name).toBe("Песок");
  });

  it("returns empty items when there is no product table at all", () => {
    expect(parseBitrixPaste("Задача № 1\nСделка: Тест").items).toEqual([]);
  });

  it("returns empty items when the table block has no recognizable header", () => {
    const paste = ["Продукция из товаров:", "1\tЦемент\t10 шт\t"].join("\n");
    expect(parseBitrixPaste(paste).items).toEqual([]);
  });
});

describe("parseBitrixPaste — quantity / unit edge cases", () => {
  function firstItem(quantityCell: string) {
    const paste = [
      "Продукция из товаров:",
      "№\tТовар\tКол-во\tКомментарий",
      `1\tТовар\t${quantityCell}\t`,
    ].join("\n");
    return parseBitrixPaste(paste).items[0];
  }

  it("splits integer quantity and unit", () => {
    expect(firstItem("20 шт")).toMatchObject({ quantity: 20, unit: "шт" });
  });

  it("parses a decimal quantity written with a comma", () => {
    expect(firstItem("1,5 м³")).toMatchObject({ quantity: 1.5, unit: "м³" });
  });

  it("parses a decimal quantity written with a dot", () => {
    expect(firstItem("2.25 т")).toMatchObject({ quantity: 2.25, unit: "т" });
  });

  it("keeps quantity but null unit for a bare number", () => {
    expect(firstItem("42")).toMatchObject({ quantity: 42, unit: null });
  });

  it("keeps the text as unit with null quantity when there is no leading number", () => {
    expect(firstItem("по запросу")).toMatchObject({ quantity: null, unit: "по запросу" });
  });

  it("yields null quantity and null unit for an empty quantity cell", () => {
    expect(firstItem("")).toMatchObject({ quantity: null, unit: null });
  });
});

describe("parseBitrixPaste — title fallbacks and field lookup", () => {
  it("falls back to 'Задача № N' when no deal title is present", () => {
    expect(parseBitrixPaste("Задача № 555").title).toBe("Задача № 555");
  });

  it("returns null title when neither deal title nor task number exists", () => {
    expect(parseBitrixPaste("какой-то текст без полей").title).toBeNull();
  });

  it("rejects a non-positive or non-numeric task number", () => {
    expect(parseBitrixPaste("Задача № 0").bitrix_task_number).toBeNull();
    expect(parseBitrixPaste("Задача № abc").bitrix_task_number).toBeNull();
  });

  it("reads the value from the next non-empty line when the label line is bare", () => {
    expect(parseBitrixPaste("Менеджер:\n\nЮлия Канищева").manager_name).toBe(
      "Юлия Канищева",
    );
  });

  it("never throws and returns empty items on partial input", () => {
    const r = parseBitrixPaste("Менеджер: Иван\nФорма оплаты: Нал");
    expect(r.manager_name).toBe("Иван");
    expect(r.payment_form).toBe("cash");
    expect(r.bitrix_task_number).toBeNull();
    expect(r.delivery_date).toBeNull();
    expect(r.items).toEqual([]);
  });
});

/**
 * Full reference paste № 113881 — format B ("dash" / "тире-формат").
 *
 * The product list has no tabular header: each row is
 * `<Товар> - <Кол-во Ед> - <цена> руб/ед - <сумма> руб`, fields split on " - ".
 * Only Товар (→ name) and Кол-во+Ед (→ quantity/unit) are imported; price and
 * sum fields are dropped, and the table is terminated by the "Итого:" line.
 * A plausible scalar header is included so we also prove findFieldValue still
 * works in the absence of a "Продукция из товаров:" marker. Names intentionally
 * carry commas and numbers ("МП 50, 100 мм") to prove they survive intact.
 */
const FULL_113881_FORMAT_B = [
  "Задача № 113881",
  "Сделка: Минеральные маты для трубопровода",
  "Менеджер: Алексей Смирнов",
  "Населенный пункт: Москва, ул. Складочная",
  "Для каких целей: изоляция трубопровода",
  "Форма оплаты: Безнал",
  "Дата поставки материала: 10.06.2026",
  "Задача в проекте (группе): мск_Утеплитель",
  'Дата "Сделал запрос снабженцу" 01.06.2026 09:30',
  "маты прошивные МП 50, 100 мм - 1.0000 упак - 0.00 руб/упак - 0 руб",
  "маты прошивные МП 80, 100 мм - 1.0000 упак - 0.00 руб/упак - 0 руб",
  "маты прошивные МП 100, 100 мм - 1.0000 упак - 0.00 руб/упак - 0 руб",
  "Доставка без разгрузки - 1.0000 шт - 0.00 руб/шт - 0 руб",
  "",
  "Итого: 10001 руб",
  "Цена которую предлагают конкуренты: -",
].join("\n");

describe("parseBitrixPaste — формат B (тире-формат, № 113881)", () => {
  it("parses every scalar field with no tabular header present", () => {
    const r = parseBitrixPaste(FULL_113881_FORMAT_B);

    expect(r.bitrix_task_number).toBe(113881);
    expect(r.manager_name).toBe("Алексей Смирнов");
    expect(r.delivery_address).toBe("Москва, ул. Складочная");
    expect(r.purposes).toBe("изоляция трубопровода");
    expect(r.payment_form).toBe("non_cash");
    expect(r.delivery_date).toBe("2026-06-10");
    expect(r.category).toBe("мск_Утеплитель");
    expect(r.deal_title).toBe("Минеральные маты для трубопровода");
    expect(r.title).toBe("Минеральные маты для трубопровода");
    expect(r.requested_at).toBe("2026-06-01T09:30");
    expect(r.raw_paste).toBe(FULL_113881_FORMAT_B);
  });

  it("extracts exactly 4 dash rows with name/quantity/unit (including 'Доставка')", () => {
    const r = parseBitrixPaste(FULL_113881_FORMAT_B);

    expect(r.items).toHaveLength(4);
    expect(r.items).toEqual([
      { name: "маты прошивные МП 50, 100 мм", quantity: 1, unit: "упак", comment: null },
      { name: "маты прошивные МП 80, 100 мм", quantity: 1, unit: "упак", comment: null },
      { name: "маты прошивные МП 100, 100 мм", quantity: 1, unit: "упак", comment: null },
      { name: "Доставка без разгрузки", quantity: 1, unit: "шт", comment: null },
    ]);
  });

  it("never leaks price / sum fields into name, unit, or comment", () => {
    const r = parseBitrixPaste(FULL_113881_FORMAT_B);
    const serialized = JSON.stringify(r.items);

    // Price-per-unit, line sum, and the grand total must all be absent.
    for (const priceLike of ["руб", "0.00", "10001"]) {
      expect(serialized).not.toContain(priceLike);
    }
    // Each item exposes exactly the four allowed keys — nothing more.
    for (const item of r.items) {
      expect(Object.keys(item).sort()).toEqual(["comment", "name", "quantity", "unit"]);
      expect(item.comment).toBeNull();
    }
  });

  it("terminates the table at 'Итого:' — rows after it are not imported", () => {
    const paste = [
      "Цемент М500 - 5.0000 меш - 100.00 руб/меш - 500 руб",
      "Итого: 500 руб",
      "Песок речной - 3.0000 м³ - 0.00 руб/м³ - 0 руб",
    ].join("\n");

    const r = parseBitrixPaste(paste);
    expect(r.items).toHaveLength(1);
    expect(r.items[0]).toMatchObject({ name: "Цемент М500", quantity: 5, unit: "меш" });
    expect(JSON.stringify(r.items)).not.toContain("Песок речной");
  });

  it("terminates the table at 'Цена которую предлагают конкуренты:'", () => {
    const paste = [
      "Утеплитель - 2.0000 упак - 0.00 руб/упак - 0 руб",
      "Цена которую предлагают конкуренты: -",
      "Скрытая строка - 9.0000 шт - 0.00 руб/шт - 0 руб",
    ].join("\n");

    const r = parseBitrixPaste(paste);
    expect(r.items).toHaveLength(1);
    expect(r.items[0]).toMatchObject({ name: "Утеплитель", quantity: 2, unit: "упак" });
    expect(JSON.stringify(r.items)).not.toContain("Скрытая строка");
  });

  it("preserves the name with quantity=null for a dash row without a numeric quantity", () => {
    const paste = [
      "Цемент М500 - 5.0000 меш - 100.00 руб/меш - 500 руб",
      "Доставка - по договоренности - 0 руб",
      "Итого: 500 руб",
    ].join("\n");

    const r = parseBitrixPaste(paste);
    expect(r.items).toHaveLength(2);
    expect(r.items[0]).toMatchObject({ name: "Цемент М500", quantity: 5, unit: "меш" });
    expect(r.items[1]).toMatchObject({ name: "Доставка", quantity: null });
  });

  it("keeps commas and numbers inside the product name intact", () => {
    const r = parseBitrixPaste(
      "плита ПСБ-С 25, 1000x500x50 мм - 12.0000 шт - 0.00 руб/шт - 0 руб",
    );

    expect(r.items).toHaveLength(1);
    expect(r.items[0]).toEqual({
      name: "плита ПСБ-С 25, 1000x500x50 мм",
      quantity: 12,
      unit: "шт",
      comment: null,
    });
  });

  it("ignores leading dash lines that have no numeric quantity (anchors on first real row)", () => {
    const paste = [
      "Примечание к заявке - срочно - уточнить",
      "Цемент М500 - 5.0000 меш - 100.00 руб/меш - 500 руб",
      "Итого: 500 руб",
    ].join("\n");

    const r = parseBitrixPaste(paste);
    expect(r.items).toHaveLength(1);
    expect(r.items[0]).toMatchObject({ name: "Цемент М500", quantity: 5, unit: "меш" });
  });

  it("returns empty items for empty input under format B", () => {
    expect(parseBitrixPaste("").items).toEqual([]);
  });

  it("auto-selects tabular format A when a 'Товар' header is present (no regression)", () => {
    const formatA = [
      "Продукция из товаров:",
      "№\tТовар\tКол-во\tНаша цена\tСумма\tКомментарий",
      "1\tКирпич облицовочный\t1500 шт\t25\t37500\tкрасный",
      "2\tРаствор кладочный\t2 м³\t3000\t6000\t",
      "Общая сумма\t43500",
      "добавить чек-лист",
    ].join("\n");

    const r = parseBitrixPaste(formatA);
    expect(r.items).toEqual([
      { name: "Кирпич облицовочный", quantity: 1500, unit: "шт", comment: "красный" },
      { name: "Раствор кладочный", quantity: 2, unit: "м³", comment: null },
    ]);
    // Tabular parser must not be derailed by " - "-style splitting.
    expect(JSON.stringify(r.items)).not.toContain("37500");
  });
});

/**
 * Testable helpers for {@link listSuppliers} text search (SRC-707 / F012).
 * Matches name, phone, contact_person on suppliers; brand via junction ids.
 */

/** Escape `%`, `_`, `\` for safe ILIKE patterns. */
export function escapeIlikePattern(term: string): string {
  return term.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

/** Returns trimmed search term or null when empty / whitespace-only. */
export function normalizeSearchTerm(
  raw: string | null | undefined,
): string | null {
  const value = String(raw ?? "").trim();
  return value === "" ? null : value;
}

/** PostgREST `.or()` filter: supplier fields + optional brand-matched ids. */
export function buildSupplierSearchOrFilter(
  term: string,
  brandSupplierIds: string[],
): string {
  const pattern = `%${escapeIlikePattern(term)}%`;
  const parts = [
    `name.ilike.${pattern}`,
    `phone.ilike.${pattern}`,
    `contact_person.ilike.${pattern}`,
  ];
  if (brandSupplierIds.length > 0) {
    parts.push(`id.in.(${brandSupplierIds.join(",")})`);
  }
  return parts.join(",");
}

export interface SupplierSearchRow {
  name: string;
  phone: string | null;
  contact_person: string | null;
}

/** Case-insensitive match against supplier text fields (unit tests / post-filter). */
export function supplierRowMatchesSearch(
  row: SupplierSearchRow,
  term: string,
): boolean {
  const needle = term.toLowerCase();
  const fields = [row.name, row.phone, row.contact_person];
  return fields.some(
    (field) => field != null && field.toLowerCase().includes(needle),
  );
}

/** True when any brand name contains the search term (case-insensitive). */
export function brandNamesMatchSearch(
  brandNames: string[],
  term: string,
): boolean {
  const needle = term.toLowerCase();
  return brandNames.some((name) => name.toLowerCase().includes(needle));
}

/** Combined row + brand junction match for a single supplier. */
export function supplierMatchesSearch(
  row: SupplierSearchRow,
  term: string,
  brandNames: string[],
): boolean {
  return (
    supplierRowMatchesSearch(row, term) ||
    brandNamesMatchSearch(brandNames, term)
  );
}

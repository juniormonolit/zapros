"use client";

import { useMemo } from "react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * A single supplier that is available for selection in a request
 * (`is_active` and `sourcing_status in ('approved','working_in_zapros')`).
 *
 * `works_in_zapros` is the only flag the picker needs to split suppliers into
 * the two sections: `true` → "Внутри системы" (an invite is created), `false`
 * (i.e. `approved` only) → "Связаться вручную" (informational, no invite).
 */
export interface PickerSupplier {
  id: string;
  name: string;
  works_in_zapros: boolean;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
}

/** A supplier group with the ids of its members that are available for selection. */
export interface PickerGroup {
  id: string;
  name: string;
  /** Available supplier ids in this group. A supplier may appear in many groups. */
  supplierIds: string[];
}

export interface SupplierPickerProps {
  /** Groups (each carrying the available member ids); rendered as parent nodes. */
  groups: PickerGroup[];
  /** Every available supplier, keyed by `id` for rendering. */
  suppliers: PickerSupplier[];
  /** Available supplier ids that belong to no group; shown under "Без группы". */
  ungroupedSupplierIds: string[];
  /** Controlled selection of in-system supplier ids (the invite recipients). */
  value: string[];
  /** Called with the next unique set of selected in-system supplier ids. */
  onChange: (ids: string[]) => void;
  /**
   * Optional controlled selection of "contact manually" supplier ids. These
   * never create an invite — they are purely informational for the sender. When
   * omitted, the manual section is still shown but its checkboxes are read-only.
   */
  manualValue?: string[];
  /** Called with the next set of manually-marked supplier ids. */
  onManualChange?: (ids: string[]) => void;
  className?: string;
}

/** Pseudo-group id for available suppliers that belong to no real group. */
const UNGROUPED_NODE_ID = "__ungrouped__";

const CHECKBOX_CLASS =
  "size-4 rounded border-border-strong accent-accent-primary disabled:opacity-50";

/** A group (or the "ungrouped" pseudo-group) projected onto one section. */
interface SectionNode {
  id: string;
  name: string;
  supplierIds: string[];
}

/**
 * Reusable supplier selector for the request flow (F003 / F010).
 *
 * Renders available suppliers as a checkbox tree grouped by `supplier_groups`,
 * split into two sections by `works_in_zapros`:
 *
 * - **«Внутри системы»** (`works_in_zapros = true`): checking a supplier adds it
 *   to `value`; these become `request_suppliers` invites on send.
 * - **«Связаться вручную»** (`approved`, `works_in_zapros = false`): shown with
 *   contact details and clearly badged as "вне системы". Marking them is
 *   informational only (`manualValue`/`onManualChange`) and never creates an
 *   invite — the server is the single trust barrier for that rule.
 *
 * Selection is tracked by unique `supplier_id`, so a supplier that appears in
 * several groups is rendered in each but only ever contributes one id to the
 * result.
 */
export function SupplierPicker({
  groups,
  suppliers,
  ungroupedSupplierIds,
  value,
  onChange,
  manualValue,
  onManualChange,
  className,
}: SupplierPickerProps) {
  const suppliersById = useMemo(
    () => new Map(suppliers.map((supplier) => [supplier.id, supplier])),
    [suppliers],
  );

  const systemNodes = useMemo(
    () => buildSectionNodes(groups, ungroupedSupplierIds, suppliersById, true),
    [groups, ungroupedSupplierIds, suppliersById],
  );
  const manualNodes = useMemo(
    () => buildSectionNodes(groups, ungroupedSupplierIds, suppliersById, false),
    [groups, ungroupedSupplierIds, suppliersById],
  );

  const selectedSet = useMemo(() => new Set(value), [value]);
  const manualSet = useMemo(() => new Set(manualValue ?? []), [manualValue]);

  function toggleSupplier(id: string) {
    const next = new Set(selectedSet);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange([...next]);
  }

  function toggleNode(node: SectionNode) {
    const next = new Set(selectedSet);
    const allSelected = node.supplierIds.every((id) => next.has(id));
    for (const id of node.supplierIds) {
      if (allSelected) next.delete(id);
      else next.add(id);
    }
    onChange([...next]);
  }

  function toggleManualSupplier(id: string) {
    if (!onManualChange) return;
    const next = new Set(manualSet);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onManualChange([...next]);
  }

  function toggleManualNode(node: SectionNode) {
    if (!onManualChange) return;
    const next = new Set(manualSet);
    const allSelected = node.supplierIds.every((id) => next.has(id));
    for (const id of node.supplierIds) {
      if (allSelected) next.delete(id);
      else next.add(id);
    }
    onManualChange([...next]);
  }

  const hasAnySupplier = suppliers.length > 0;

  return (
    <div className={cn("flex flex-col gap-5", className)}>
      <div
        className="flex items-center gap-2 text-sm text-text-secondary"
        aria-live="polite"
      >
        <span>Выбрано поставщиков:</span>
        <span className="font-medium text-text-primary tabular-nums">
          {selectedSet.size}
        </span>
      </div>

      {!hasAnySupplier ? (
        <p className="text-sm text-text-secondary">
          Нет доступных поставщиков для выбора.
        </p>
      ) : (
        <>
          <Section
            title="Внутри системы"
            badge={<Badge variant="success">В системе</Badge>}
            hint="Запрос уходит внутри Zapros — этим поставщикам создаётся приглашение."
            nodes={systemNodes}
            suppliersById={suppliersById}
            selectedSet={selectedSet}
            onToggleSupplier={toggleSupplier}
            onToggleNode={toggleNode}
            emptyText="Нет поставщиков, работающих внутри системы."
          />

          <Section
            title="Связаться вручную"
            badge={<Badge variant="muted">Вне системы</Badge>}
            hint="Поставщик одобрен, но не работает в Zapros: приглашение не создаётся — свяжитесь по телефону или email."
            nodes={manualNodes}
            suppliersById={suppliersById}
            selectedSet={manualSet}
            onToggleSupplier={toggleManualSupplier}
            onToggleNode={toggleManualNode}
            disabled={!onManualChange}
            showContact
            emptyText="Нет поставщиков для ручной связи."
          />
        </>
      )}
    </div>
  );
}

interface SectionProps {
  title: string;
  badge: React.ReactNode;
  hint: string;
  nodes: SectionNode[];
  suppliersById: Map<string, PickerSupplier>;
  selectedSet: Set<string>;
  onToggleSupplier: (id: string) => void;
  onToggleNode: (node: SectionNode) => void;
  emptyText: string;
  /** Render contact details (phone/email) under each supplier name. */
  showContact?: boolean;
  /** Render checkboxes as read-only (no selection callback wired). */
  disabled?: boolean;
}

function Section({
  title,
  badge,
  hint,
  nodes,
  suppliersById,
  selectedSet,
  onToggleSupplier,
  onToggleNode,
  emptyText,
  showContact = false,
  disabled = false,
}: SectionProps) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
        {badge}
      </div>
      <p className="text-xs text-text-secondary">{hint}</p>

      {nodes.length === 0 ? (
        <p className="text-sm text-text-muted">{emptyText}</p>
      ) : (
        <div className="flex flex-col gap-2 rounded-lg border border-border-primary bg-bg-secondary/40 p-2">
          {nodes.map((node) => (
            <GroupNode
              key={node.id}
              node={node}
              suppliersById={suppliersById}
              selectedSet={selectedSet}
              onToggleSupplier={onToggleSupplier}
              onToggleNode={onToggleNode}
              showContact={showContact}
              disabled={disabled}
            />
          ))}
        </div>
      )}
    </section>
  );
}

interface GroupNodeProps {
  node: SectionNode;
  suppliersById: Map<string, PickerSupplier>;
  selectedSet: Set<string>;
  onToggleSupplier: (id: string) => void;
  onToggleNode: (node: SectionNode) => void;
  showContact: boolean;
  disabled: boolean;
}

function GroupNode({
  node,
  suppliersById,
  selectedSet,
  onToggleSupplier,
  onToggleNode,
  showContact,
  disabled,
}: GroupNodeProps) {
  const total = node.supplierIds.length;
  const selectedCount = node.supplierIds.filter((id) =>
    selectedSet.has(id),
  ).length;
  const allSelected = total > 0 && selectedCount === total;
  const someSelected = selectedCount > 0 && !allSelected;

  return (
    <div className="rounded-md border border-border-primary/60 bg-bg-primary/30">
      <label className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium text-text-primary hover:bg-bg-secondary">
        <input
          type="checkbox"
          aria-label={`Выбрать всю группу «${node.name}»`}
          className={CHECKBOX_CLASS}
          checked={allSelected}
          disabled={disabled}
          ref={(el) => {
            if (el) el.indeterminate = someSelected;
          }}
          onChange={() => onToggleNode(node)}
        />
        <span className="flex-1">{node.name}</span>
        <span className="text-xs font-normal text-text-secondary tabular-nums">
          {selectedCount}/{total}
        </span>
      </label>

      <div className="flex flex-col gap-0.5 pb-1 pl-6 pr-2">
        {node.supplierIds.map((id) => {
          const supplier = suppliersById.get(id);
          if (!supplier) return null;
          return (
            <SupplierCheckbox
              key={`${node.id}:${id}`}
              supplier={supplier}
              checked={selectedSet.has(id)}
              disabled={disabled}
              showContact={showContact}
              onToggle={() => onToggleSupplier(id)}
            />
          );
        })}
      </div>
    </div>
  );
}

interface SupplierCheckboxProps {
  supplier: PickerSupplier;
  checked: boolean;
  disabled: boolean;
  showContact: boolean;
  onToggle: () => void;
}

function SupplierCheckbox({
  supplier,
  checked,
  disabled,
  showContact,
  onToggle,
}: SupplierCheckboxProps) {
  const contact = showContact
    ? [supplier.contact_person, supplier.phone, supplier.email]
        .filter(Boolean)
        .join(" · ")
    : "";

  return (
    <label className="flex items-start gap-2 rounded-md px-2 py-1.5 text-sm text-text-primary hover:bg-bg-secondary">
      <input
        type="checkbox"
        aria-label={`Выбрать поставщика «${supplier.name}»`}
        className={cn(CHECKBOX_CLASS, "mt-0.5")}
        checked={checked}
        disabled={disabled}
        onChange={onToggle}
      />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate">{supplier.name}</span>
        {showContact && contact ? (
          <span className="truncate text-xs text-text-secondary">{contact}</span>
        ) : null}
      </span>
    </label>
  );
}

/**
 * Project the groups + ungrouped suppliers onto one section, keeping only the
 * members whose `works_in_zapros` matches `inSystem`. Empty nodes are dropped so
 * a group with no members in this section is not rendered. The ungrouped
 * members are appended as a trailing "Без группы" node.
 */
function buildSectionNodes(
  groups: PickerGroup[],
  ungroupedSupplierIds: string[],
  suppliersById: Map<string, PickerSupplier>,
  inSystem: boolean,
): SectionNode[] {
  const matches = (id: string) =>
    suppliersById.get(id)?.works_in_zapros === inSystem;

  const nodes: SectionNode[] = [];

  for (const group of groups) {
    const supplierIds = group.supplierIds.filter(matches);
    if (supplierIds.length > 0) {
      nodes.push({ id: group.id, name: group.name, supplierIds });
    }
  }

  const ungrouped = ungroupedSupplierIds.filter(matches);
  if (ungrouped.length > 0) {
    nodes.push({
      id: UNGROUPED_NODE_ID,
      name: "Без группы",
      supplierIds: ungrouped,
    });
  }

  return nodes;
}

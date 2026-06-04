import { describe, expect, it } from "vitest";

import {
  AVAILABILITY_STATUSES,
  NOTIFICATION_CHANNELS,
  PRICE_MODELS,
  SUPPLIER_KINDS,
  SUPPLIER_MEMBER_ROLES,
  VEHICLE_TYPES,
  WAVE_PRIORITIES,
} from "@/actions/supplier-org-types";
import {
  AVAILABILITY_STATUS_LABELS,
  NOTIFICATION_CHANNEL_LABELS,
  PRICE_MODEL_LABELS,
  SUPPLIER_KIND_LABELS,
  SUPPLIER_MEMBER_ROLE_LABELS,
  VEHICLE_TYPE_LABELS,
  WAVE_PRIORITY_LABELS,
} from "@/lib/supplier-org-labels";

describe("supplier-org label maps (F012)", () => {
  it.each(SUPPLIER_KINDS)("SUPPLIER_KIND_LABELS covers %s", (kind) => {
    expect(SUPPLIER_KIND_LABELS[kind]).toMatch(/\S/);
  });

  it.each(WAVE_PRIORITIES)("WAVE_PRIORITY_LABELS covers %s", (priority) => {
    expect(WAVE_PRIORITY_LABELS[priority]).toMatch(/\S/);
  });

  it.each(SUPPLIER_MEMBER_ROLES)("SUPPLIER_MEMBER_ROLE_LABELS covers %s", (role) => {
    expect(SUPPLIER_MEMBER_ROLE_LABELS[role]).toMatch(/\S/);
  });

  it.each(VEHICLE_TYPES)("VEHICLE_TYPE_LABELS covers %s", (type) => {
    expect(VEHICLE_TYPE_LABELS[type]).toMatch(/\S/);
  });

  it.each(PRICE_MODELS)("PRICE_MODEL_LABELS covers %s", (model) => {
    expect(PRICE_MODEL_LABELS[model]).toMatch(/\S/);
  });

  it.each(AVAILABILITY_STATUSES)("AVAILABILITY_STATUS_LABELS covers %s", (status) => {
    expect(AVAILABILITY_STATUS_LABELS[status]).toMatch(/\S/);
  });

  it.each(NOTIFICATION_CHANNELS)("NOTIFICATION_CHANNEL_LABELS covers %s", (channel) => {
    expect(NOTIFICATION_CHANNEL_LABELS[channel]).toMatch(/\S/);
  });

  it("re-exports enum arrays from supplier-org-types", () => {
    expect(SUPPLIER_KINDS).toEqual([
      "manufacturer",
      "dealer",
      "carrier",
      "mixed",
    ]);
    expect(WAVE_PRIORITIES).toContain("normal");
    expect(NOTIFICATION_CHANNELS).toContain("cabinet");
  });
});

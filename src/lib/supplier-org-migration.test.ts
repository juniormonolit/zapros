import { existsSync, readFileSync } from "node:fs";
import { basename, resolve } from "node:path";

import { describe, expect, it } from "vitest";

/** F012 / SRC-701 contract for `supabase/migrations/018_supplier_org_enums.sql`. */
const MIGRATION_PATH = resolve(
  process.cwd(),
  "supabase/migrations/018_supplier_org_enums.sql",
);

const EXPECTED_ENUMS: Record<string, readonly string[]> = {
  supplier_member_role: ["supplier_admin", "supplier_user"],
  supplier_kind: ["manufacturer", "dealer", "carrier", "mixed"],
  supplier_wave_priority: [
    "favorite",
    "verified",
    "normal",
    "reserve",
    "stop_list",
  ],
  supplier_vehicle_type: [
    "manipulator",
    "truck",
    "semitrailer",
    "dump_truck",
    "tonar",
    "gazelle",
    "other",
  ],
  supplier_price_model: ["fixed", "per_km", "per_hour", "negotiable"],
  supplier_availability_status: ["available", "busy", "unknown"],
};

const SUPPLIERS_COLUMNS = [
  "supplier_kind",
  "wave_priority",
  "regions",
  "share_team_responses",
  "notification_channels",
  "works_with_vat",
  "payment_deferral_days",
  "min_order_amount",
  "delivery_available",
  "pickup_available",
  "terms_comment",
] as const;

function readMigrationSql(): string {
  return readFileSync(MIGRATION_PATH, "utf8");
}

function enumCreatePattern(typeName: string): RegExp {
  return new RegExp(
    `create type public\\.${typeName} as enum\\s*\\([^)]+\\)`,
    "i",
  );
}

describe("018_supplier_org_enums migration (SRC-701)", () => {
  const sql = readMigrationSql();

  it("migration file exists and references SRC-701", () => {
    expect(existsSync(MIGRATION_PATH)).toBe(true);
    expect(basename(MIGRATION_PATH)).toBe("018_supplier_org_enums.sql");
    expect(sql.length).toBeGreaterThan(0);
    expect(sql).toContain("SRC-701");
  });

  it.each(Object.entries(EXPECTED_ENUMS))(
    "defines enum %s with F012 values",
    (typeName, values) => {
      expect(sql).toMatch(enumCreatePattern(typeName));
      expect(sql).toMatch(
        new RegExp(`pg_type where typname = '${typeName}'`, "i"),
      );
      for (const value of values) {
        expect(sql).toContain(`'${value}'`);
      }
    },
  );

  it("extends suppliers with org columns (IF NOT EXISTS)", () => {
    for (const column of SUPPLIERS_COLUMNS) {
      expect(sql).toMatch(
        new RegExp(
          `add column if not exists ${column}\\b`,
          "i",
        ),
      );
    }
    expect(sql).toMatch(
      /wave_priority\s+public\.supplier_wave_priority\s+not null\s+default\s+'normal'/i,
    );
  });

  it("adds org filter indexes on active suppliers", () => {
    expect(sql).toContain("suppliers_org_kind_priority_idx");
    expect(sql).toContain("suppliers_org_regions_gin_idx");
    expect(sql).toMatch(/create index if not exists/i);
    expect(sql).toMatch(/where is_active/i);
  });

  it("does not create supplier_members (deferred to SRC-702)", () => {
    expect(sql).not.toMatch(/create\s+table\s+.*supplier_members/i);
  });
});

/** F012 / SRC-702 contract for `supabase/migrations/019_supplier_members.sql`. */
const MEMBERS_MIGRATION_PATH = resolve(
  process.cwd(),
  "supabase/migrations/019_supplier_members.sql",
);

const MEMBER_COLUMNS = [
  "user_id",
  "supplier_id",
  "member_role",
  "is_active",
  "notification_channels",
  "created_at",
  "updated_at",
] as const;

function readMembersMigrationSql(): string {
  return readFileSync(MEMBERS_MIGRATION_PATH, "utf8");
}

describe("019_supplier_members migration (SRC-702)", () => {
  const sql = readMembersMigrationSql();

  it("migration file exists and references SRC-702", () => {
    expect(existsSync(MEMBERS_MIGRATION_PATH)).toBe(true);
    expect(basename(MEMBERS_MIGRATION_PATH)).toBe("019_supplier_members.sql");
    expect(sql.length).toBeGreaterThan(0);
    expect(sql).toContain("SRC-702");
  });

  it("creates supplier_members with F012 columns and unique user_id", () => {
    expect(sql).toMatch(/create\s+table\s+if\s+not\s+exists\s+public\.supplier_members/i);
    for (const column of MEMBER_COLUMNS) {
      expect(sql).toMatch(new RegExp(`\\b${column}\\b`, "i"));
    }
    expect(sql).toMatch(/supplier_member_role/i);
    expect(sql).toMatch(/supplier_members_user_id_key\s+unique\s*\(\s*user_id\s*\)/i);
  });

  it("backfills supplier role profiles with supplier_admin", () => {
    expect(sql).toMatch(
      /insert\s+into\s+public\.supplier_members[\s\S]*where\s+p\.role\s*=\s*'supplier'/i,
    );
    expect(sql).toContain("'supplier_admin'::public.supplier_member_role");
    expect(sql).toMatch(/on\s+conflict\s*\(\s*user_id\s*\)\s+do\s+nothing/i);
  });

  it("syncs profiles.supplier_id via trigger on membership changes", () => {
    expect(sql).toContain("sync_profile_supplier_id_from_membership");
    expect(sql).toContain("supplier_members_sync_profile_supplier_id");
    expect(sql).toMatch(/after\s+insert\s+or\s+update/i);
    expect(sql).toMatch(/set\s+supplier_id\s*=\s*new\.supplier_id/i);
    expect(sql).toMatch(/set\s+supplier_id\s*=\s*null/i);
  });

  it("enables RLS without policies (deferred to SRC-705)", () => {
    expect(sql).toMatch(
      /alter\s+table\s+public\.supplier_members\s+enable\s+row\s+level\s+security/i,
    );
    expect(sql).not.toMatch(/create\s+policy/i);
  });

  it("does not create warehouses or productions (SRC-703)", () => {
    expect(sql).not.toMatch(/supplier_warehouses/i);
    expect(sql).not.toMatch(/supplier_productions/i);
    expect(sql).not.toMatch(/supplier_vehicles/i);
  });
});

/** F012 / SRC-703 contract for `supabase/migrations/020_supplier_sites_and_vehicles.sql`. */
const SITES_MIGRATION_PATH = resolve(
  process.cwd(),
  "supabase/migrations/020_supplier_sites_and_vehicles.sql",
);

const SITE_COLUMNS = [
  "supplier_id",
  "name",
  "address",
  "region",
  "latitude",
  "longitude",
  "contact_name",
  "phone",
  "working_hours",
  "loading_conditions",
  "comment",
  "is_active",
  "created_at",
  "updated_at",
] as const;

const WAREHOUSE_ONLY_COLUMNS = [
  "pickup_available",
  "delivery_available",
] as const;

const VEHICLE_COLUMNS = [
  "supplier_id",
  "title",
  "vehicle_type",
  "payload_tons",
  "volume_m3",
  "body_length_m",
  "region",
  "price_model",
  "base_price",
  "availability_status",
  "comment",
  "is_active",
  "created_at",
  "updated_at",
] as const;

function readSitesMigrationSql(): string {
  return readFileSync(SITES_MIGRATION_PATH, "utf8");
}

describe("020_supplier_sites_and_vehicles migration (SRC-703)", () => {
  const sql = readSitesMigrationSql();

  it("migration file exists and references SRC-703", () => {
    expect(existsSync(SITES_MIGRATION_PATH)).toBe(true);
    expect(basename(SITES_MIGRATION_PATH)).toBe(
      "020_supplier_sites_and_vehicles.sql",
    );
    expect(sql.length).toBeGreaterThan(0);
    expect(sql).toContain("SRC-703");
  });

  it("creates supplier_warehouses with F012 site columns and pickup/delivery flags", () => {
    expect(sql).toMatch(
      /create\s+table\s+if\s+not\s+exists\s+public\.supplier_warehouses/i,
    );
    for (const column of SITE_COLUMNS) {
      expect(sql).toMatch(new RegExp(`\\b${column}\\b`, "i"));
    }
    for (const column of WAREHOUSE_ONLY_COLUMNS) {
      expect(sql).toMatch(new RegExp(`\\b${column}\\b`, "i"));
    }
    expect(sql).toMatch(
      /references\s+public\.suppliers\s*\(\s*id\s*\)\s+on\s+delete\s+cascade/i,
    );
  });

  it("creates supplier_productions with shared site columns (no pickup/delivery)", () => {
    expect(sql).toMatch(
      /create\s+table\s+if\s+not\s+exists\s+public\.supplier_productions/i,
    );
    for (const column of SITE_COLUMNS) {
      expect(sql).toMatch(new RegExp(`\\b${column}\\b`, "i"));
    }
    const productionsBlock = sql.match(
      /create\s+table\s+if\s+not\s+exists\s+public\.supplier_productions[\s\S]*?\);/i,
    )?.[0];
    expect(productionsBlock).toBeDefined();
    for (const column of WAREHOUSE_ONLY_COLUMNS) {
      expect(productionsBlock!).not.toMatch(new RegExp(`\\b${column}\\b`, "i"));
    }
  });

  it("creates supplier_vehicles with F012 fleet columns and enums from 018", () => {
    expect(sql).toMatch(
      /create\s+table\s+if\s+not\s+exists\s+public\.supplier_vehicles/i,
    );
    for (const column of VEHICLE_COLUMNS) {
      expect(sql).toMatch(new RegExp(`\\b${column}\\b`, "i"));
    }
    expect(sql).toMatch(/public\.supplier_vehicle_type/i);
    expect(sql).toMatch(/public\.supplier_price_model/i);
    expect(sql).toMatch(/public\.supplier_availability_status/i);
    expect(sql).toMatch(
      /availability_status\s+public\.supplier_availability_status\s+not\s+null\s+default\s+'unknown'/i,
    );
  });

  it("adds supplier_id indexes and updated_at triggers on all three tables", () => {
    expect(sql).toContain("idx_supplier_warehouses_supplier_id");
    expect(sql).toContain("idx_supplier_productions_supplier_id");
    expect(sql).toContain("idx_supplier_vehicles_supplier_id");
    expect(sql).toContain("set_supplier_warehouses_updated_at");
    expect(sql).toContain("set_supplier_productions_updated_at");
    expect(sql).toContain("set_supplier_vehicles_updated_at");
    expect(sql).toMatch(/execute function public\.set_updated_at\(\)/i);
  });

  it("enables RLS without policies (deferred to SRC-705)", () => {
    expect(sql).toMatch(
      /alter\s+table\s+public\.supplier_warehouses\s+enable\s+row\s+level\s+security/i,
    );
    expect(sql).toMatch(
      /alter\s+table\s+public\.supplier_productions\s+enable\s+row\s+level\s+security/i,
    );
    expect(sql).toMatch(
      /alter\s+table\s+public\.supplier_vehicles\s+enable\s+row\s+level\s+security/i,
    );
    expect(sql).toMatch(/policies in SRC-705/i);
    expect(sql).not.toMatch(/create\s+policy/i);
  });
});

/** F012 / SRC-704 contract for `supabase/migrations/021_product_categories_brands.sql`. */
const CATALOG_MIGRATION_PATH = resolve(
  process.cwd(),
  "supabase/migrations/021_product_categories_brands.sql",
);

const REF_COLUMNS = ["key", "name", "sort_order", "is_active"] as const;

const F012_CATEGORY_SEEDS: ReadonlyArray<{ key: string; name: string }> = [
  { key: "insulation", name: "Утеплитель" },
  { key: "aerated_concrete", name: "Газобетон" },
  { key: "roofing", name: "Кровля" },
  { key: "aggregates", name: "Нерудные материалы" },
  { key: "concrete", name: "Бетон" },
  { key: "precast_concrete", name: "ЖБИ" },
  { key: "transport", name: "Перевозки" },
];

const F012_BRAND_SEEDS: ReadonlyArray<{ key: string; name: string }> = [
  { key: "technonicol", name: "Технониколь" },
  { key: "rockwool", name: "Rockwool" },
  { key: "isoroc", name: "Isoroc" },
  { key: "bonolit", name: "Bonolit" },
  { key: "ytong", name: "Ytong" },
  { key: "metall_profil", name: "Металл Профиль" },
  { key: "penoplex", name: "Пеноплэкс" },
  { key: "knauf", name: "Knauf" },
  { key: "grand_line", name: "Grand Line" },
  { key: "lsr", name: "ЛСР" },
];

function readCatalogMigrationSql(): string {
  return readFileSync(CATALOG_MIGRATION_PATH, "utf8");
}

describe("021_product_categories_brands migration (SRC-704)", () => {
  const sql = readCatalogMigrationSql();

  it("migration file exists and references SRC-704", () => {
    expect(existsSync(CATALOG_MIGRATION_PATH)).toBe(true);
    expect(basename(CATALOG_MIGRATION_PATH)).toBe(
      "021_product_categories_brands.sql",
    );
    expect(sql.length).toBeGreaterThan(0);
    expect(sql).toContain("SRC-704");
  });

  it("creates product_categories and product_brands with unique key slug", () => {
    expect(sql).toMatch(
      /create\s+table\s+if\s+not\s+exists\s+public\.product_categories/i,
    );
    expect(sql).toMatch(
      /create\s+table\s+if\s+not\s+exists\s+public\.product_brands/i,
    );
    for (const column of REF_COLUMNS) {
      expect(sql).toMatch(new RegExp(`product_categories[\\s\\S]*\\b${column}\\b`, "i"));
      expect(sql).toMatch(new RegExp(`product_brands[\\s\\S]*\\b${column}\\b`, "i"));
    }
    expect(sql).toMatch(/product_categories_key_key\s+unique\s*\(\s*key\s*\)/i);
    expect(sql).toMatch(/product_brands_key_key\s+unique\s*\(\s*key\s*\)/i);
    expect(sql).toMatch(/id\s+uuid\s+primary\s+key/i);
  });

  it("creates supplier_categories and supplier_brands junctions (supplier-level MVP)", () => {
    expect(sql).toMatch(
      /create\s+table\s+if\s+not\s+exists\s+public\.supplier_categories/i,
    );
    expect(sql).toMatch(
      /create\s+table\s+if\s+not\s+exists\s+public\.supplier_brands/i,
    );
    expect(sql).toMatch(
      /primary\s+key\s*\(\s*supplier_id\s*,\s*category_id\s*\)/i,
    );
    expect(sql).toMatch(/primary\s+key\s*\(\s*supplier_id\s*,\s*brand_id\s*\)/i);
    expect(sql).toMatch(
      /references\s+public\.suppliers\s*\(\s*id\s*\)\s+on\s+delete\s+cascade/i,
    );
    expect(sql).toMatch(
      /references\s+public\.product_categories\s*\(\s*id\s*\)\s+on\s+delete\s+cascade/i,
    );
    expect(sql).toMatch(
      /references\s+public\.product_brands\s*\(\s*id\s*\)\s+on\s+delete\s+cascade/i,
    );
    expect(sql).toContain("idx_supplier_categories_category_id");
    expect(sql).toContain("idx_supplier_brands_brand_id");
  });

  it("does not create site-level junction tables (deferred)", () => {
    expect(sql).not.toMatch(
      /create\s+table\s+if\s+not\s+exists\s+public\.warehouse_/i,
    );
    expect(sql).not.toMatch(
      /create\s+table\s+if\s+not\s+exists\s+public\.production_/i,
    );
  });

  it.each(F012_CATEGORY_SEEDS)("seeds category %s", ({ key, name }) => {
    expect(sql).toContain(`'${key}'`);
    expect(sql).toContain(`'${name}'`);
  });

  it.each(F012_BRAND_SEEDS)("seeds brand %s", ({ key, name }) => {
    expect(sql).toContain(`'${key}'`);
    expect(sql).toContain(`'${name}'`);
  });

  it("uses idempotent seed inserts (on conflict do nothing)", () => {
    expect(sql).toMatch(
      /insert\s+into\s+public\.product_categories[\s\S]*on\s+conflict\s*\(\s*key\s*\)\s+do\s+nothing/i,
    );
    expect(sql).toMatch(
      /insert\s+into\s+public\.product_brands[\s\S]*on\s+conflict\s*\(\s*key\s*\)\s+do\s+nothing/i,
    );
  });

  it("enables RLS without policies (deferred to SRC-705)", () => {
    expect(sql).toMatch(
      /alter\s+table\s+public\.product_categories\s+enable\s+row\s+level\s+security/i,
    );
    expect(sql).toMatch(
      /alter\s+table\s+public\.product_brands\s+enable\s+row\s+level\s+security/i,
    );
    expect(sql).toMatch(
      /alter\s+table\s+public\.supplier_categories\s+enable\s+row\s+level\s+security/i,
    );
    expect(sql).toMatch(
      /alter\s+table\s+public\.supplier_brands\s+enable\s+row\s+level\s+security/i,
    );
    expect(sql).toMatch(/policies in SRC-705/i);
    expect(sql).not.toMatch(/create\s+policy/i);
  });
});

/** F012 / SRC-705 contract for `supabase/migrations/022_supplier_org_rls.sql`. */
const RLS_MIGRATION_PATH = resolve(
  process.cwd(),
  "supabase/migrations/022_supplier_org_rls.sql",
);

const RLS_HELPERS = [
  "current_user_supplier_id",
  "is_supplier_user",
  "is_supplier_org_admin",
  "can_read_supplier_org",
  "can_write_supplier_org",
] as const;

const ORG_SCOPED_TABLES = [
  "supplier_members",
  "supplier_warehouses",
  "supplier_productions",
  "supplier_vehicles",
  "supplier_categories",
  "supplier_brands",
] as const;

const ORG_POLICY_SUFFIXES = ["select", "insert", "update", "delete"] as const;

function readRlsMigrationSql(): string {
  return readFileSync(RLS_MIGRATION_PATH, "utf8");
}

function expectedPolicyName(
  table: string,
  suffix: (typeof ORG_POLICY_SUFFIXES)[number],
): string {
  return `${table}_${suffix}`;
}

describe("022_supplier_org_rls migration (SRC-705)", () => {
  const sql = readRlsMigrationSql();

  it("migration file exists and references SRC-705", () => {
    expect(existsSync(RLS_MIGRATION_PATH)).toBe(true);
    expect(basename(RLS_MIGRATION_PATH)).toBe("022_supplier_org_rls.sql");
    expect(sql.length).toBeGreaterThan(0);
    expect(sql).toContain("SRC-705");
  });

  it("updates current_user_supplier_id from active membership with profiles fallback", () => {
    expect(sql).toMatch(
      /create\s+or\s+replace\s+function\s+public\.current_user_supplier_id\(\)/i,
    );
    expect(sql).toMatch(/from\s+public\.supplier_members\s+sm/i);
    expect(sql).toMatch(/sm\.user_id\s*=\s*\(\s*select\s+auth\.uid\(\)\s*\)/i);
    expect(sql).toMatch(/sm\.is_active/i);
    expect(sql).toMatch(/coalesce\s*\(/i);
    expect(sql).toMatch(/from\s+public\.profiles\s+p/i);
    expect(sql).toMatch(/security\s+definer/i);
    expect(sql).toMatch(/set\s+search_path\s*=\s*''/i);
  });

  it.each(RLS_HELPERS)("defines helper %s", (helper) => {
    expect(sql).toMatch(
      new RegExp(
        `create\\s+or\\s+replace\\s+function\\s+public\\.${helper}\\(`,
        "i",
      ),
    );
  });

  it("implements F012 Option A procurement read and supplier_admin write helpers", () => {
    expect(sql).toMatch(/current_user_role\(\)\s*=\s*'procurement'/i);
    expect(sql).toMatch(/member_role\s*=\s*'supplier_admin'/i);
    expect(sql).toMatch(/can_read_supplier_org/i);
    expect(sql).toMatch(/can_write_supplier_org/i);
    expect(sql).toMatch(/is_supplier_org_admin/i);
  });

  it("does not modify request_suppliers or requests policies", () => {
    expect(sql).not.toMatch(
      /drop\s+policy\s+if\s+exists\s+request_suppliers_/i,
    );
    expect(sql).not.toMatch(/on\s+public\.request_suppliers/i);
    expect(sql).not.toMatch(/on\s+public\.requests/i);
    expect(sql).not.toMatch(/on\s+public\.request_items/i);
  });

  it("suppliers policies: procurement SELECT, senior write, supplier_admin UPDATE own org", () => {
    expect(sql).toContain("suppliers_select");
    expect(sql).toContain("suppliers_insert");
    expect(sql).toContain("suppliers_update");
    expect(sql).toContain("suppliers_delete");
    const selectBlock = sql.match(
      /create\s+policy\s+suppliers_select[\s\S]*?;/i,
    )?.[0];
    expect(selectBlock).toBeDefined();
    expect(selectBlock!).toMatch(/current_user_role\(\)\s*=\s*'procurement'/i);
    expect(selectBlock!).toMatch(/is_supplier_user/i);
    const updateBlock = sql.match(
      /create\s+policy\s+suppliers_update[\s\S]*?;/i,
    )?.[0];
    expect(updateBlock).toBeDefined();
    expect(updateBlock!).toMatch(/is_supplier_org_admin/i);
    expect(updateBlock!).toMatch(/current_user_supplier_id\(\)/i);
    expect(sql).toMatch(
      /create\s+policy\s+suppliers_insert[\s\S]*is_senior_or_admin\(\)/i,
    );
    expect(sql).toMatch(
      /create\s+policy\s+suppliers_delete[\s\S]*is_admin\(\)/i,
    );
  });

  it.each(ORG_SCOPED_TABLES)(
    "creates four org-scoped policies on %s",
    (table) => {
      for (const suffix of ORG_POLICY_SUFFIXES) {
        const name = expectedPolicyName(table, suffix);
        expect(sql).toContain(name);
        expect(sql).toMatch(
          new RegExp(`create\\s+policy\\s+${name}\\s+on\\s+public\\.${table}`, "i"),
        );
      }
      if (table === "supplier_members") {
        expect(sql).toMatch(
          new RegExp(
            `create\\s+policy\\s+${table}_select[\\s\\S]*can_read_supplier_org`,
            "i",
          ),
        );
        expect(sql).toMatch(
          new RegExp(
            `create\\s+policy\\s+${table}_insert[\\s\\S]*can_write_supplier_org`,
            "i",
          ),
        );
      } else {
        expect(sql).toMatch(
          new RegExp(
            `create\\s+policy\\s+${table}_select[\\s\\S]*can_read_supplier_org\\(supplier_id\\)`,
            "i",
          ),
        );
        expect(sql).toMatch(
          new RegExp(
            `create\\s+policy\\s+${table}_insert[\\s\\S]*can_write_supplier_org\\(supplier_id\\)`,
            "i",
          ),
        );
      }
    },
  );

  it("creates reference catalog policies (read authenticated, write admin)", () => {
    for (const table of ["product_categories", "product_brands"] as const) {
      for (const suffix of ORG_POLICY_SUFFIXES) {
        expect(sql).toContain(`${table}_${suffix}`);
      }
      expect(sql).toMatch(
        new RegExp(
          `create\\s+policy\\s+${table}_select[\\s\\S]*auth\\.uid\\(\\)`,
          "i",
        ),
      );
      expect(sql).toMatch(
        new RegExp(
          `create\\s+policy\\s+${table}_insert[\\s\\S]*is_admin\\(\\)`,
          "i",
        ),
      );
    }
  });

  it("drops policies before recreate (idempotent)", () => {
    expect(sql).toMatch(/drop policy if exists/i);
    const dropCount = (sql.match(/drop policy if exists/gi) ?? []).length;
    expect(dropCount).toBeGreaterThanOrEqual(36);
  });
});

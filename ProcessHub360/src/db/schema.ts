// SQLite schema + non-destructive migrations (PRAGMA user_version). Migrations are append-only: never edit a shipped one.
// Everything that talks to SQLite goes through the small `Db` interface so the same code runs on expo-sqlite (app) and node:sqlite (tests).
export interface Db {
  execAsync(sql: string): Promise<void>;
  runAsync(sql: string, params?: any[]): Promise<{ lastInsertRowId: number; changes: number }>;
  getAllAsync<T>(sql: string, params?: any[]): Promise<T[]>;
  getFirstAsync<T>(sql: string, params?: any[]): Promise<T | null>;
  withTransactionAsync(task: () => Promise<void>): Promise<void>;
}

// Columns every synced table carries: tenant isolation, optimistic versioning, soft delete, origin device.
const SYNC = `tenant_id TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
    version INTEGER NOT NULL DEFAULT 1, deleted_at INTEGER, device_id TEXT NOT NULL DEFAULT ''`;

const MIGRATIONS: string[] = [
  // v1 - initial schema
  `
  CREATE TABLE meta (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);
  CREATE TABLE counters (name TEXT PRIMARY KEY NOT NULL, value INTEGER NOT NULL);
  CREATE TABLE settings (id TEXT PRIMARY KEY NOT NULL, data TEXT NOT NULL);

  CREATE TABLE roles (id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, permissions TEXT NOT NULL, is_system INTEGER NOT NULL DEFAULT 0, ${SYNC});
  CREATE TABLE users (
    id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, role_id TEXT NOT NULL REFERENCES roles(id),
    pin_salt TEXT NOT NULL, pin_hash TEXT NOT NULL, fail_count INTEGER NOT NULL DEFAULT 0, locked_until INTEGER NOT NULL DEFAULT 0,
    active INTEGER NOT NULL DEFAULT 1, ${SYNC});
  CREATE TABLE activity_log (id TEXT PRIMARY KEY NOT NULL, tenant_id TEXT NOT NULL, user_id TEXT, action TEXT NOT NULL, entity TEXT, entity_id TEXT, detail TEXT, at INTEGER NOT NULL);
  CREATE INDEX idx_activity_at ON activity_log(at);

  CREATE TABLE units (id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, dimension TEXT NOT NULL CHECK (dimension IN ('weight','count','volume')), factor REAL NOT NULL, ${SYNC});
  CREATE TABLE material_categories (id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, ${SYNC});
  CREATE TABLE materials (
    id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('raw','finished','intermediate','byproduct','waste','packaging')),
    category_id TEXT REFERENCES material_categories(id), dimension TEXT NOT NULL DEFAULT 'weight',
    default_unit TEXT NOT NULL DEFAULT 'kg', spec TEXT NOT NULL DEFAULT '', min_stock_base INTEGER NOT NULL DEFAULT 0,
    active INTEGER NOT NULL DEFAULT 1, ${SYNC});
  CREATE INDEX idx_materials_name ON materials(name COLLATE NOCASE);

  CREATE TABLE customers (id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, phone TEXT NOT NULL DEFAULT '', address TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '', ${SYNC});
  CREATE INDEX idx_customers_name ON customers(name COLLATE NOCASE);
  CREATE TABLE suppliers (id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, phone TEXT NOT NULL DEFAULT '', address TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '', ${SYNC});

  CREATE TABLE workflow_templates (id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, ${SYNC});
  -- immutable: rows are only ever inserted
  CREATE TABLE workflow_versions (id TEXT PRIMARY KEY NOT NULL, tenant_id TEXT NOT NULL, template_id TEXT NOT NULL REFERENCES workflow_templates(id),
    version INTEGER NOT NULL, stages TEXT NOT NULL, created_at INTEGER NOT NULL, device_id TEXT NOT NULL DEFAULT '', UNIQUE (template_id, version));
  CREATE TABLE processing_definitions (
    id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, template_id TEXT NOT NULL REFERENCES workflow_templates(id),
    byproduct_policy TEXT NOT NULL DEFAULT 'return_to_customer' CHECK (byproduct_policy IN ('return_to_customer','keep_by_business')),
    expected_outputs TEXT NOT NULL DEFAULT '[]', pricing TEXT NOT NULL DEFAULT '{}', active INTEGER NOT NULL DEFAULT 1, ${SYNC});
  CREATE TABLE customer_rates (id TEXT PRIMARY KEY NOT NULL, customer_id TEXT NOT NULL REFERENCES customers(id), definition_id TEXT NOT NULL REFERENCES processing_definitions(id),
    rule_id TEXT NOT NULL, rate_minor INTEGER NOT NULL, ${SYNC}, UNIQUE (customer_id, definition_id, rule_id));

  CREATE TABLE orders (
    id TEXT PRIMARY KEY NOT NULL, token TEXT NOT NULL UNIQUE, mode TEXT NOT NULL CHECK (mode IN ('single','master')),
    customer_id TEXT REFERENCES customers(id), walk_in_name TEXT NOT NULL DEFAULT '', walk_in_phone TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'received', created_by TEXT, notes TEXT NOT NULL DEFAULT '', ${SYNC});
  CREATE INDEX idx_orders_customer ON orders(customer_id);
  CREATE INDEX idx_orders_created ON orders(created_at);

  CREATE TABLE jobs (
    id TEXT PRIMARY KEY NOT NULL, order_id TEXT NOT NULL REFERENCES orders(id), token TEXT NOT NULL UNIQUE, seq_in_order INTEGER NOT NULL,
    definition_id TEXT REFERENCES processing_definitions(id), definition_name TEXT NOT NULL,
    ownership TEXT NOT NULL CHECK (ownership IN ('customer','business')),
    workflow TEXT NOT NULL,            -- immutable snapshot (template id, version, stages) taken at creation
    runtime TEXT NOT NULL,             -- stage statuses + history
    pricing_snapshot TEXT NOT NULL,    -- policy + result at creation
    status TEXT NOT NULL DEFAULT 'received',
    input_base INTEGER NOT NULL DEFAULT 0, bags INTEGER NOT NULL DEFAULT 0, delivered_base INTEGER NOT NULL DEFAULT 0,
    charge_minor INTEGER NOT NULL DEFAULT 0, cost_minor INTEGER NOT NULL DEFAULT 0,
    stock_posted INTEGER NOT NULL DEFAULT 0, notes TEXT NOT NULL DEFAULT '', ${SYNC});
  CREATE INDEX idx_jobs_order ON jobs(order_id);
  CREATE INDEX idx_jobs_status ON jobs(status);
  CREATE TABLE job_lines (id TEXT PRIMARY KEY NOT NULL, job_id TEXT NOT NULL REFERENCES jobs(id),
    role TEXT NOT NULL CHECK (role IN ('input','output','intermediate','byproduct','waste')),
    material_id TEXT NOT NULL REFERENCES materials(id), qty_base INTEGER NOT NULL CHECK (qty_base >= 0), stage_index INTEGER, ${SYNC});
  CREATE INDEX idx_lines_job ON job_lines(job_id);
  CREATE TABLE deliveries (id TEXT PRIMARY KEY NOT NULL, job_id TEXT NOT NULL REFERENCES jobs(id), qty_base INTEGER NOT NULL CHECK (qty_base > 0),
    at INTEGER NOT NULL, note TEXT NOT NULL DEFAULT '', by_user TEXT, ${SYNC});

  -- append-only money records; idempotency_key stops a retried save from being counted twice
  CREATE TABLE payments (
    id TEXT PRIMARY KEY NOT NULL, order_id TEXT REFERENCES orders(id), job_id TEXT REFERENCES jobs(id), customer_id TEXT REFERENCES customers(id),
    amount_minor INTEGER NOT NULL CHECK (amount_minor > 0), kind TEXT NOT NULL CHECK (kind IN ('receipt','refund','advance')),
    method TEXT NOT NULL DEFAULT 'cash', idempotency_key TEXT NOT NULL UNIQUE, at INTEGER NOT NULL, note TEXT NOT NULL DEFAULT '', by_user TEXT, ${SYNC});
  CREATE INDEX idx_payments_order ON payments(order_id);
  CREATE INDEX idx_payments_customer ON payments(customer_id);
  CREATE INDEX idx_payments_at ON payments(at);
  CREATE TABLE expenses (id TEXT PRIMARY KEY NOT NULL, category TEXT NOT NULL, amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
    on_date TEXT NOT NULL, note TEXT NOT NULL DEFAULT '', job_id TEXT REFERENCES jobs(id), ${SYNC});
  CREATE INDEX idx_expenses_date ON expenses(on_date);

  -- two physically separate ledgers: customer property vs business stock
  CREATE TABLE custody_ledger (
    id TEXT PRIMARY KEY NOT NULL, tenant_id TEXT NOT NULL, job_id TEXT NOT NULL REFERENCES jobs(id), material_id TEXT NOT NULL REFERENCES materials(id),
    delta_base INTEGER NOT NULL, reason TEXT NOT NULL CHECK (reason IN ('receive','deliver','return','process_loss','byproduct_to_business')), at INTEGER NOT NULL, device_id TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, version INTEGER NOT NULL DEFAULT 1, deleted_at INTEGER);
  CREATE INDEX idx_custody_job ON custody_ledger(job_id);
  CREATE TABLE warehouses (id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, ${SYNC});
  CREATE TABLE stock_ledger (
    id TEXT PRIMARY KEY NOT NULL, material_id TEXT NOT NULL REFERENCES materials(id), warehouse_id TEXT NOT NULL REFERENCES warehouses(id),
    delta_base INTEGER NOT NULL, value_minor_delta INTEGER NOT NULL DEFAULT 0,
    reason TEXT NOT NULL CHECK (reason IN ('opening','purchase','production_in','production_out','byproduct','wastage','adjustment','transfer_in','transfer_out','sale')),
    ref_type TEXT, ref_id TEXT, batch_no TEXT NOT NULL DEFAULT '', at INTEGER NOT NULL, note TEXT NOT NULL DEFAULT '', ${SYNC});
  CREATE INDEX idx_stock_material ON stock_ledger(material_id);

  CREATE TABLE sync_outbox (
    id TEXT PRIMARY KEY NOT NULL, tenant_id TEXT NOT NULL, entity TEXT NOT NULL, entity_id TEXT NOT NULL, op TEXT NOT NULL,
    payload TEXT NOT NULL, idempotency_key TEXT NOT NULL UNIQUE, attempts INTEGER NOT NULL DEFAULT 0, next_attempt_at INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','conflict')), last_error TEXT, created_at INTEGER NOT NULL);
  CREATE INDEX idx_outbox_status ON sync_outbox(status, next_attempt_at);
  `,
];

export async function migrate(db: Db): Promise<void> {
  await db.execAsync('PRAGMA foreign_keys = ON;');
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  let v = row?.user_version ?? 0;
  while (v < MIGRATIONS.length) {
    const sql = MIGRATIONS[v];
    await db.withTransactionAsync(async () => {
      await db.execAsync(sql);
      await db.execAsync(`PRAGMA user_version = ${v + 1};`);
    });
    v++;
  }
}

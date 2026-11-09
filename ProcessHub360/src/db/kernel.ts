// Shared plumbing for every repo module: ids, tenant/device identity, versioned writes and the sync outbox.
import type { Db } from './schema';
import { migrate } from './schema';
import { newId } from '../core/ids';
import { idempotencyKey } from '../core/sync';
import { DEFAULT_UNITS } from '../core/units';
import { SYSTEM_ROLES } from '../core/rbac';
import { DEFAULT_SETTINGS, Settings } from './types';

export const parse = <T,>(s: any, fallback: T): T => { try { return s ? JSON.parse(s) : fallback; } catch { return fallback; } };

export interface Kernel {
  db: Db; tenantId: string; deviceId: string; deviceCode: string; now(): number;
  insert(table: string, row: Record<string, any>, o?: { immutable?: boolean; noSync?: boolean }): Promise<void>;
  update(table: string, id: string, patch: Record<string, any>): Promise<void>;
  remove(table: string, id: string): Promise<void>;
  queue(table: string, id: string, op?: 'upsert' | 'delete'): Promise<void>;
  tx(task: () => Promise<void>): Promise<void>;
  logActivity(userId: string | null | undefined, action: string, entity?: string, entityId?: string, detail?: string): Promise<void>;
  nextSeq(name: string, start: number): Promise<number>;
  getSettings(): Promise<Settings>; saveSettings(s: Settings): Promise<Settings>;
}

export async function createKernel(db: Db, opts: { now?: () => number } = {}): Promise<Kernel> {
  await migrate(db);
  const now = opts.now ?? (() => Date.now());
  const meta = async (key: string, make: () => string) => {
    const r = await db.getFirstAsync<{ value: string }>('SELECT value FROM meta WHERE key = ?', [key]);
    if (r) return r.value;
    const v = make(); await db.runAsync('INSERT INTO meta (key, value) VALUES (?, ?)', [key, v]); return v;
  };
  const tenantId = await meta('tenant_id', newId);
  const deviceId = await meta('device_id', newId);
  const deviceCode = await meta('device_code', () => deviceId.replace(/-/g, '').slice(0, 3).toUpperCase());

  let depth = 0;
  const k: Kernel = {
    db, tenantId, deviceId, deviceCode, now,
    async tx(task) {
      if (depth > 0) return task();
      depth++;
      try { await db.withTransactionAsync(task); } finally { depth--; }
    },
    async queue(table, id, op = 'upsert') {
      const row = await db.getFirstAsync<any>(`SELECT * FROM ${table} WHERE id = ?`, [id]);
      if (!row) return;
      const version = Number(row.version ?? 1);
      await db.runAsync(
        `INSERT OR IGNORE INTO sync_outbox (id, tenant_id, entity, entity_id, op, payload, idempotency_key, next_attempt_at, created_at) VALUES (?,?,?,?,?,?,?,?,?)`,
        [newId(), tenantId, table, id, op, JSON.stringify(row), idempotencyKey(deviceId, table, id, version) + (op === 'delete' ? ':del' : ''), 0, now()]);
    },
    async insert(table, row, o = {}) {
      const t = now();
      const full: Record<string, any> = o.immutable
        ? { ...row, tenant_id: tenantId, created_at: t, device_id: deviceId }
        : { ...row, tenant_id: tenantId, created_at: t, updated_at: t, version: 1, device_id: deviceId };
      const cols = Object.keys(full);
      await db.runAsync(`INSERT INTO ${table} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`, cols.map((c) => full[c]));
      if (!o.noSync) await k.queue(table, row.id);
    },
    async update(table, id, patch) {
      const cols = Object.keys(patch);
      await db.runAsync(`UPDATE ${table} SET ${cols.map((c) => `${c} = ?`).join(', ')}${cols.length ? ',' : ''} updated_at = ?, version = version + 1 WHERE id = ?`, [...cols.map((c) => patch[c]), now(), id]);
      await k.queue(table, id);
    },
    async remove(table, id) {
      await db.runAsync(`UPDATE ${table} SET deleted_at = ?, updated_at = ?, version = version + 1 WHERE id = ?`, [now(), now(), id]);
      await k.queue(table, id, 'delete');
    },
    async logActivity(userId, action, entity, entityId, detail) {
      await db.runAsync('INSERT INTO activity_log (id, tenant_id, user_id, action, entity, entity_id, detail, at) VALUES (?,?,?,?,?,?,?,?)',
        [newId(), tenantId, userId ?? null, action, entity ?? null, entityId ?? null, detail ?? null, now()]);
    },
    async nextSeq(name, start) {
      await db.runAsync('INSERT OR IGNORE INTO counters (name, value) VALUES (?, ?)', [name, start - 1]);
      await db.runAsync('UPDATE counters SET value = value + 1 WHERE name = ?', [name]);
      return (await db.getFirstAsync<{ value: number }>('SELECT value FROM counters WHERE name = ?', [name]))!.value;
    },
    async getSettings() {
      const r = await db.getFirstAsync<{ data: string }>('SELECT data FROM settings WHERE id = ?', ['main']);
      return { ...DEFAULT_SETTINGS, ...parse<Partial<Settings>>(r?.data, {}) };
    },
    async saveSettings(s) {
      await db.runAsync('INSERT OR REPLACE INTO settings (id, data) VALUES (?, ?)', ['main', JSON.stringify(s)]); return s;
    },
  };

  // seed shared reference data once (same ids on every device, so it never needs to sync)
  if (!(await db.getFirstAsync('SELECT id FROM units LIMIT 1'))) {
    for (const u of DEFAULT_UNITS) await k.insert('units', { id: u.id, name: u.name, dimension: u.dimension, factor: u.factor }, { noSync: true });
    for (const r of SYSTEM_ROLES) await k.insert('roles', { id: r.id, name: r.name, permissions: JSON.stringify(r.permissions), is_system: 1 }, { noSync: true });
    await k.insert('warehouses', { id: 'main', name: 'Main warehouse' }, { noSync: true });
  }
  return k;
}

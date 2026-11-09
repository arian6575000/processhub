// Users/roles, materials, customers, suppliers, processing definitions (with workflow template versioning).
import { Kernel, parse } from './kernel';
import { newId } from '../core/ids';
import { hashPin, samePin, lockoutMs, validPinFormat } from '../core/pin';
import { Permission, RoleDef } from '../core/rbac';
import { publishVersion, StageDef, TemplateVersion, validateStages } from '../core/workflow';
import { emptyPolicy, PricingPolicy } from '../core/pricing';
import type { ExpectedOutput } from '../core/processing';
import type { Definition, Material, MaterialKind, Party } from './types';
import { MATERIAL_KINDS } from './types';
import type { UnitDef } from '../core/units';

const toMaterial = (r: any): Material => ({ id: r.id, name: r.name, kind: r.kind, dimension: r.dimension, defaultUnit: r.default_unit, spec: r.spec, minStockBase: r.min_stock_base, active: !!r.active });
const toParty = (r: any): Party => ({ id: r.id, name: r.name, phone: r.phone, address: r.address, notes: r.notes });

export function masterData(k: Kernel) {
  const db = k.db;
  const live = 'deleted_at IS NULL';

  const api = {
    // ---------------- units ----------------
    async listUnits(): Promise<UnitDef[]> {
      return (await db.getAllAsync<any>(`SELECT * FROM units WHERE ${live} ORDER BY dimension, factor`)).map((r) => ({ id: r.id, name: r.name, dimension: r.dimension, factor: r.factor }));
    },

    // ---------------- users & roles ----------------
    async listRoles(): Promise<RoleDef[]> {
      return (await db.getAllAsync<any>(`SELECT * FROM roles WHERE ${live} ORDER BY is_system DESC, name`)).map((r) => ({ id: r.id, name: r.name, system: !!r.is_system, permissions: parse<Permission[]>(r.permissions, []) }));
    },
    async saveRole(r: { id?: string; name: string; permissions: Permission[] }): Promise<string> {
      if (!r.name.trim()) throw new Error('Role name is required');
      if (r.id) {
        const ex = await db.getFirstAsync<any>('SELECT is_system FROM roles WHERE id = ?', [r.id]);
        if (ex?.is_system) throw new Error('System roles cannot be edited');
        await k.update('roles', r.id, { name: r.name.trim(), permissions: JSON.stringify(r.permissions) }); return r.id;
      }
      const id = newId(); await k.insert('roles', { id, name: r.name.trim(), permissions: JSON.stringify(r.permissions), is_system: 0 }); return id;
    },
    async hasUsers(): Promise<boolean> { return !!(await db.getFirstAsync(`SELECT id FROM users WHERE ${live} LIMIT 1`)); },
    async listUsers() {
      return (await db.getAllAsync<any>(`SELECT id, name, role_id, active FROM users WHERE ${live} ORDER BY name COLLATE NOCASE`)).map((u) => ({ id: u.id as string, name: u.name as string, roleId: u.role_id as string, active: !!u.active }));
    },
    async createUser(u: { name: string; roleId: string; pin: string }, actorId?: string | null): Promise<string> {
      if (!u.name.trim()) throw new Error('Name is required');
      if (!validPinFormat(u.pin)) throw new Error('PIN must be 4 to 8 digits');
      const salt = newId().replace(/-/g, '');
      const id = newId();
      await k.insert('users', { id, name: u.name.trim(), role_id: u.roleId, pin_salt: salt, pin_hash: hashPin(u.pin, salt), fail_count: 0, locked_until: 0, active: 1 });
      await k.logActivity(actorId, 'user.create', 'users', id, u.name.trim());
      return id;
    },
    async setUserActive(id: string, active: boolean, actorId?: string | null) {
      if (!active) {
        const owners = await db.getFirstAsync<{ n: number }>(`SELECT COUNT(*) AS n FROM users WHERE role_id = 'owner' AND active = 1 AND ${live} AND id <> ?`, [id]);
        const me = await db.getFirstAsync<any>('SELECT role_id FROM users WHERE id = ?', [id]);
        if (me?.role_id === 'owner' && (owners?.n ?? 0) === 0) throw new Error('Keep at least one active owner');
      }
      await k.update('users', id, { active: active ? 1 : 0 });
      await k.logActivity(actorId, active ? 'user.enable' : 'user.disable', 'users', id);
    },
    async login(userId: string, pin: string): Promise<{ ok: true; user: { id: string; name: string; role: RoleDef } } | { ok: false; reason: 'wrong' | 'locked' | 'inactive'; lockedUntil?: number }> {
      const u = await db.getFirstAsync<any>(`SELECT * FROM users WHERE id = ? AND ${live}`, [userId]);
      if (!u || !u.active) return { ok: false, reason: 'inactive' };
      if (u.locked_until > k.now()) return { ok: false, reason: 'locked', lockedUntil: u.locked_until };
      if (samePin(hashPin(pin, u.pin_salt), u.pin_hash)) {
        await db.runAsync('UPDATE users SET fail_count = 0, locked_until = 0 WHERE id = ?', [userId]);
        const role = (await api.listRoles()).find((r) => r.id === u.role_id)!;
        await k.logActivity(userId, 'login');
        return { ok: true, user: { id: u.id, name: u.name, role } };
      }
      const fails = u.fail_count + 1, lock = lockoutMs(fails);
      await db.runAsync('UPDATE users SET fail_count = ?, locked_until = ? WHERE id = ?', [fails, lock ? k.now() + lock : 0, userId]);
      await k.logActivity(userId, 'login.failed');
      return lock ? { ok: false, reason: 'locked', lockedUntil: k.now() + lock } : { ok: false, reason: 'wrong' };
    },
    async activity(limit = 50) {
      return db.getAllAsync<{ id: string; user_id: string | null; action: string; entity: string | null; detail: string | null; at: number }>('SELECT id, user_id, action, entity, detail, at FROM activity_log ORDER BY at DESC LIMIT ?', [limit]);
    },

    // ---------------- materials ----------------
    async listMaterials(kind?: MaterialKind): Promise<Material[]> {
      const rows = kind
        ? await db.getAllAsync<any>(`SELECT * FROM materials WHERE ${live} AND kind = ? ORDER BY name COLLATE NOCASE`, [kind])
        : await db.getAllAsync<any>(`SELECT * FROM materials WHERE ${live} ORDER BY name COLLATE NOCASE`);
      return rows.map(toMaterial);
    },
    async saveMaterial(m: { id?: string; name: string; kind: MaterialKind; dimension?: Material['dimension']; defaultUnit?: string; spec?: string; minStockBase?: number }): Promise<string> {
      if (!m.name.trim()) throw new Error('Material name is required');
      if (!MATERIAL_KINDS.includes(m.kind)) throw new Error('Invalid material type');
      const dup = await db.getFirstAsync<any>(`SELECT id FROM materials WHERE ${live} AND name = ? COLLATE NOCASE AND id <> ?`, [m.name.trim(), m.id ?? '']);
      if (dup) throw new Error('A material with this name already exists');
      const f = { name: m.name.trim(), kind: m.kind, dimension: m.dimension ?? 'weight', default_unit: m.defaultUnit ?? 'kg', spec: m.spec ?? '', min_stock_base: m.minStockBase ?? 0 };
      if (m.id) { await k.update('materials', m.id, f); return m.id; }
      const id = newId(); await k.insert('materials', { id, ...f, active: 1 }); return id;
    },

    // ---------------- customers & suppliers ----------------
    async listCustomers(search = ''): Promise<Party[]> {
      const q = `%${search.trim()}%`;
      return (await db.getAllAsync<any>(`SELECT * FROM customers WHERE ${live} AND (name LIKE ? OR phone LIKE ?) ORDER BY name COLLATE NOCASE`, [q, q])).map(toParty);
    },
    async getCustomer(id: string): Promise<Party | null> { const r = await db.getFirstAsync<any>('SELECT * FROM customers WHERE id = ?', [id]); return r ? toParty(r) : null; },
    async saveCustomer(c: { id?: string; name: string; phone?: string; address?: string; notes?: string }): Promise<string> {
      if (!c.name.trim()) throw new Error('Customer name is required');
      const f = { name: c.name.trim(), phone: (c.phone ?? '').trim(), address: c.address ?? '', notes: c.notes ?? '' };
      if (c.id) { await k.update('customers', c.id, f); return c.id; }
      const id = newId(); await k.insert('customers', { id, ...f }); return id;
    },
    async deleteCustomer(id: string) {
      const n = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM orders WHERE customer_id = ?', [id]);
      if ((n?.n ?? 0) > 0) throw new Error('This customer has orders and cannot be deleted');
      await k.remove('customers', id);
    },
    async listSuppliers(): Promise<Party[]> { return (await db.getAllAsync<any>(`SELECT * FROM suppliers WHERE ${live} ORDER BY name COLLATE NOCASE`)).map(toParty); },
    async saveSupplier(c: { id?: string; name: string; phone?: string; address?: string; notes?: string }): Promise<string> {
      if (!c.name.trim()) throw new Error('Supplier name is required');
      const f = { name: c.name.trim(), phone: (c.phone ?? '').trim(), address: c.address ?? '', notes: c.notes ?? '' };
      if (c.id) { await k.update('suppliers', c.id, f); return c.id; }
      const id = newId(); await k.insert('suppliers', { id, ...f }); return id;
    },

    // ---------------- workflow templates (versioned) + processing definitions ----------------
    async latestVersion(templateId: string): Promise<TemplateVersion> {
      const r = await db.getFirstAsync<any>('SELECT * FROM workflow_versions WHERE template_id = ? ORDER BY version DESC LIMIT 1', [templateId]);
      if (!r) throw new Error('Workflow template not found');
      return { id: r.id, templateId: r.template_id, version: r.version, stages: parse<StageDef[]>(r.stages, []), createdAt: r.created_at };
    },
    async publishWorkflow(templateId: string, stages: StageDef[]): Promise<TemplateVersion> {
      const prev = await db.getFirstAsync<any>('SELECT * FROM workflow_versions WHERE template_id = ? ORDER BY version DESC LIMIT 1', [templateId]);
      const prevV = prev ? { id: prev.id, templateId, version: prev.version, stages: parse<StageDef[]>(prev.stages, []), createdAt: prev.created_at } : null;
      const v = publishVersion(prevV, templateId, stages, newId(), k.now());
      await k.insert('workflow_versions', { id: v.id, template_id: templateId, version: v.version, stages: JSON.stringify(v.stages) }, { immutable: true });
      return v;
    },
    async saveDefinition(d: { id?: string; name: string; stages: StageDef[]; expectedOutputs?: ExpectedOutput[]; pricing?: PricingPolicy; byproductPolicy?: Definition['byproductPolicy'] }): Promise<{ id: string; version: number }> {
      if (!d.name.trim()) throw new Error('Definition name is required');
      validateStages(d.stages);
      let id = d.id ?? '', version = 1;
      await k.tx(async () => {
        const fields = { name: d.name.trim(), byproduct_policy: d.byproductPolicy ?? 'return_to_customer', expected_outputs: JSON.stringify(d.expectedOutputs ?? []), pricing: JSON.stringify(d.pricing ?? emptyPolicy()) };
        if (d.id) {
          const ex = await db.getFirstAsync<any>('SELECT template_id FROM processing_definitions WHERE id = ?', [d.id]);
          if (!ex) throw new Error('Definition not found');
          const cur = await api.latestVersion(ex.template_id);
          version = JSON.stringify(cur.stages) === JSON.stringify(d.stages) ? cur.version : (await api.publishWorkflow(ex.template_id, d.stages)).version;
          await k.update('processing_definitions', d.id, fields);
        } else {
          id = newId(); const tid = newId();
          await k.insert('workflow_templates', { id: tid, name: d.name.trim() });
          version = (await api.publishWorkflow(tid, d.stages)).version;
          await k.insert('processing_definitions', { id, template_id: tid, ...fields, active: 1 });
        }
      });
      return { id, version };
    },
    async listDefinitions(): Promise<Definition[]> {
      const rows = await db.getAllAsync<any>(`SELECT * FROM processing_definitions WHERE ${live} ORDER BY name COLLATE NOCASE`);
      const out: Definition[] = [];
      for (const r of rows) out.push(await api.hydrateDefinition(r));
      return out;
    },
    async hydrateDefinition(r: any): Promise<Definition> {
      const v = await api.latestVersion(r.template_id);
      return { id: r.id, name: r.name, templateId: r.template_id, byproductPolicy: r.byproduct_policy, expectedOutputs: parse(r.expected_outputs, []), pricing: parse(r.pricing, emptyPolicy()), active: !!r.active, stages: v.stages, version: v.version };
    },
    async getDefinition(id: string): Promise<Definition | null> {
      const r = await db.getFirstAsync<any>('SELECT * FROM processing_definitions WHERE id = ?', [id]);
      return r ? api.hydrateDefinition(r) : null;
    },
    async setCustomerRate(customerId: string, definitionId: string, ruleId: string, rateMinor: number) {
      if (!Number.isInteger(rateMinor) || rateMinor < 0) throw new Error('Rate must be zero or more');
      const ex = await db.getFirstAsync<any>('SELECT id FROM customer_rates WHERE customer_id = ? AND definition_id = ? AND rule_id = ?', [customerId, definitionId, ruleId]);
      if (ex) await k.update('customer_rates', ex.id, { rate_minor: rateMinor, deleted_at: null });
      else await k.insert('customer_rates', { id: newId(), customer_id: customerId, definition_id: definitionId, rule_id: ruleId, rate_minor: rateMinor });
    },
    async customerRates(customerId: string, definitionId: string): Promise<Record<string, number>> {
      const rows = await db.getAllAsync<any>(`SELECT rule_id, rate_minor FROM customer_rates WHERE customer_id = ? AND definition_id = ? AND ${live}`, [customerId, definitionId]);
      return Object.fromEntries(rows.map((r) => [r.rule_id, r.rate_minor]));
    },
  };
  return api;
}

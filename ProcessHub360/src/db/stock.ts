// BUSINESS-OWNED stock only. Customer material never touches this ledger (see ownership.ts + orders.ts).
import { Kernel } from './kernel';
import { newId } from '../core/ids';
import { emptyPosition, issue, needsReorder, receive, StockPosition } from '../core/inventory';
import { assertStockOwnership, Ownership } from '../core/ownership';

export type StockReason = 'opening' | 'purchase' | 'production_in' | 'production_out' | 'byproduct' | 'wastage' | 'adjustment' | 'transfer_in' | 'transfer_out' | 'sale';

export function stockModule(k: Kernel) {
  const db = k.db;
  const api = {
    async position(materialId: string, warehouseId?: string): Promise<StockPosition> {
      const r = warehouseId
        ? await db.getFirstAsync<any>('SELECT COALESCE(SUM(delta_base),0) q, COALESCE(SUM(value_minor_delta),0) v FROM stock_ledger WHERE material_id = ? AND warehouse_id = ? AND deleted_at IS NULL', [materialId, warehouseId])
        : await db.getFirstAsync<any>('SELECT COALESCE(SUM(delta_base),0) q, COALESCE(SUM(value_minor_delta),0) v FROM stock_ledger WHERE material_id = ? AND deleted_at IS NULL', [materialId]);
      return { qtyBase: r?.q ?? 0, valueMinor: r?.v ?? 0 };
    },
    async post(row: { materialId: string; warehouseId?: string; delta: number; value: number; reason: StockReason; refType?: string; refId?: string; batchNo?: string; note?: string }) {
      await k.insert('stock_ledger', {
        id: newId(), material_id: row.materialId, warehouse_id: row.warehouseId ?? 'main', delta_base: row.delta, value_minor_delta: row.value,
        reason: row.reason, ref_type: row.refType ?? null, ref_id: row.refId ?? null, batch_no: row.batchNo ?? '', at: k.now(), note: row.note ?? '',
      });
    },
    /** Purchase / opening balance / production output. */
    async receiveStock(o: { materialId: string; warehouseId?: string; qtyBase: number; valueMinor: number; reason?: 'opening' | 'purchase'; batchNo?: string; note?: string; ownership?: Ownership }) {
      assertStockOwnership(o.ownership ?? 'business');
      receive({ qtyBase: 0, valueMinor: 0 }, o.qtyBase, o.valueMinor); // validates
      await k.tx(async () => { await api.post({ materialId: o.materialId, warehouseId: o.warehouseId, delta: o.qtyBase, value: o.valueMinor, reason: o.reason ?? 'purchase', batchNo: o.batchNo, note: o.note }); });
    },
    /** Consume stock at weighted-average cost. Throws if there is not enough. Returns the cost. */
    async consume(o: { materialId: string; warehouseId?: string; qtyBase: number; reason: StockReason; refType?: string; refId?: string; note?: string }): Promise<number> {
      const pos = await api.position(o.materialId, o.warehouseId ?? 'main');
      const { costMinor } = issue(pos, o.qtyBase);
      await api.post({ materialId: o.materialId, warehouseId: o.warehouseId, delta: -o.qtyBase, value: -costMinor, reason: o.reason, refType: o.refType, refId: o.refId, note: o.note });
      return costMinor;
    },
    async adjust(o: { materialId: string; deltaBase: number; reason: 'adjustment' | 'wastage'; warehouseId?: string; note?: string }) {
      if (!Number.isInteger(o.deltaBase) || o.deltaBase === 0) throw new Error('Adjustment cannot be zero');
      await k.tx(async () => {
        if (o.deltaBase < 0) await api.consume({ materialId: o.materialId, warehouseId: o.warehouseId, qtyBase: -o.deltaBase, reason: o.reason, note: o.note });
        else await api.post({ materialId: o.materialId, warehouseId: o.warehouseId, delta: o.deltaBase, value: 0, reason: 'adjustment', note: o.note });
      });
    },
    async transfer(o: { materialId: string; from: string; to: string; qtyBase: number }) {
      if (o.from === o.to) throw new Error('Choose two different warehouses');
      await k.tx(async () => {
        const cost = await api.consume({ materialId: o.materialId, warehouseId: o.from, qtyBase: o.qtyBase, reason: 'transfer_out' });
        await api.post({ materialId: o.materialId, warehouseId: o.to, delta: o.qtyBase, value: cost, reason: 'transfer_in' });
      });
    },
    async listWarehouses() { return db.getAllAsync<{ id: string; name: string }>('SELECT id, name FROM warehouses WHERE deleted_at IS NULL ORDER BY name'); },
    async saveWarehouse(name: string): Promise<string> {
      if (!name.trim()) throw new Error('Warehouse name is required');
      const id = newId(); await k.insert('warehouses', { id, name: name.trim() }); return id;
    },
    /** One row per material that has stock movements, with valuation and reorder flag. */
    async stockList() {
      const rows = await db.getAllAsync<any>(`
        SELECT m.id, m.name, m.kind, m.default_unit, m.min_stock_base,
               COALESCE(SUM(l.delta_base),0) q, COALESCE(SUM(l.value_minor_delta),0) v
        FROM materials m LEFT JOIN stock_ledger l ON l.material_id = m.id AND l.deleted_at IS NULL
        WHERE m.deleted_at IS NULL GROUP BY m.id ORDER BY m.name COLLATE NOCASE`);
      return rows.map((r) => ({ materialId: r.id as string, name: r.name as string, kind: r.kind as string, unit: r.default_unit as string,
        qtyBase: r.q as number, valueMinor: r.v as number, minStockBase: r.min_stock_base as number,
        low: needsReorder({ qtyBase: r.q, valueMinor: r.v }, r.min_stock_base) }));
    },
    async ledger(materialId: string, limit = 50) {
      return db.getAllAsync<any>('SELECT * FROM stock_ledger WHERE material_id = ? AND deleted_at IS NULL ORDER BY at DESC LIMIT ?', [materialId, limit]);
    },
    emptyPosition,
  };
  return api;
}

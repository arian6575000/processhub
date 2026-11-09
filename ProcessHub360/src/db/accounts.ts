// Expenses, daily cash closing, dashboard numbers and reports. Only real data from the local database is reported.
import { Kernel, parse } from './kernel';
import { newId } from '../core/ids';
import type { stockModule } from './stock';

export const dayRange = (isoDate: string): [number, number] => {
  const [y, m, d] = isoDate.split('-').map(Number);
  const start = new Date(y, m - 1, d).getTime();
  return [start, start + 86400000];
};
export const todayIso = (now: number) => { const d = new Date(now); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

export function accountsModule(k: Kernel, stock: ReturnType<typeof stockModule>) {
  const db = k.db;
  const NET = "CASE kind WHEN 'refund' THEN -amount_minor ELSE amount_minor END";

  const api = {
    async addExpense(e: { category: string; amountMinor: number; onDate?: string; note?: string; jobId?: string | null }, userId?: string | null): Promise<string> {
      if (!e.category.trim()) throw new Error('Category is required');
      if (!Number.isInteger(e.amountMinor) || e.amountMinor <= 0) throw new Error('Amount must be more than zero');
      const id = newId();
      await k.insert('expenses', { id, category: e.category.trim(), amount_minor: e.amountMinor, on_date: e.onDate ?? todayIso(k.now()), note: e.note ?? '', job_id: e.jobId ?? null });
      await k.logActivity(userId, 'expense.add', 'expenses', id, e.category);
      return id;
    },
    async listExpenses(from: string, to: string) {
      return db.getAllAsync<{ id: string; category: string; amount_minor: number; on_date: string; note: string }>(
        'SELECT id, category, amount_minor, on_date, note FROM expenses WHERE deleted_at IS NULL AND on_date >= ? AND on_date <= ? ORDER BY on_date DESC, created_at DESC', [from, to]);
    },

    /** Money movement for one day. Revenue is counted once: only payments (cash view) and expenses; stock purchases are not double-counted as expenses. */
    async cashSummary(date: string) {
      const [a, b] = dayRange(date);
      const rows = await db.getAllAsync<{ method: string; s: number }>(`SELECT method, SUM(${NET}) s FROM payments WHERE at >= ? AND at < ? GROUP BY method`, [a, b]);
      const cashIn = rows.find((r) => r.method === 'cash')?.s ?? 0;
      const otherIn = rows.filter((r) => r.method !== 'cash').reduce((x, r) => x + r.s, 0);
      const exp = (await db.getFirstAsync<{ s: number }>('SELECT COALESCE(SUM(amount_minor),0) s FROM expenses WHERE on_date = ? AND deleted_at IS NULL', [date]))!.s;
      return { date, cashInMinor: cashIn, otherInMinor: otherIn, expensesMinor: exp, netMinor: cashIn + otherIn - exp };
    },
    async closeCash(date: string, countedMinor: number, userId?: string | null) {
      if (!Number.isInteger(countedMinor) || countedMinor < 0) throw new Error('Counted cash must be zero or more');
      const prev = await db.getFirstAsync<{ key: string; value: string }>("SELECT key, value FROM meta WHERE key LIKE 'cash_close:%' AND key < ? ORDER BY key DESC LIMIT 1", [`cash_close:${date}`]);
      const opening = prev ? parse<any>(prev.value, {}).countedMinor ?? 0 : 0;
      const s = await api.cashSummary(date);
      const expected = opening + s.cashInMinor - s.expensesMinor;
      const rec = { date, openingMinor: opening, expectedMinor: expected, countedMinor, differenceMinor: countedMinor - expected, closedAt: k.now(), by: userId ?? null };
      await db.runAsync('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)', [`cash_close:${date}`, JSON.stringify(rec)]);
      await k.logActivity(userId, 'cash.close', 'cash', date, String(rec.differenceMinor));
      return rec;
    },
    async getClose(date: string) { const r = await db.getFirstAsync<{ value: string }>('SELECT value FROM meta WHERE key = ?', [`cash_close:${date}`]); return r ? parse<any>(r.value, null) : null; },

    async dashboard(nowTs = k.now()) {
      const date = todayIso(nowTs); const [a, b] = dayRange(date);
      const one = async (sql: string, p: any[] = []) => (await db.getFirstAsync<{ n: number }>(sql, p))!.n ?? 0;
      const ordersToday = await one('SELECT COUNT(*) n FROM orders WHERE created_at >= ? AND created_at < ? AND deleted_at IS NULL', [a, b]);
      const pendingJobs = await one("SELECT COUNT(*) n FROM jobs WHERE status IN ('received','in_progress') AND deleted_at IS NULL");
      const readyJobs = await one("SELECT COUNT(*) n FROM jobs WHERE status IN ('ready','partially_delivered') AND ownership = 'customer' AND deleted_at IS NULL");
      const completedToday = await one("SELECT COUNT(*) n FROM jobs WHERE status = 'delivered' AND updated_at >= ? AND updated_at < ? AND deleted_at IS NULL", [a, b]);
      const sumLines = async (role: string) => one('SELECT COALESCE(SUM(l.qty_base),0) n FROM job_lines l JOIN jobs j ON j.id = l.job_id WHERE l.role = ? AND j.created_at >= ? AND j.created_at < ? AND l.deleted_at IS NULL AND j.status <> \'cancelled\'', [role, a, b]);
      const inputTodayBase = await sumLines('input'), outputTodayBase = await sumLines('output');
      const billedTodayMinor = await one("SELECT COALESCE(SUM(charge_minor),0) n FROM jobs WHERE created_at >= ? AND created_at < ? AND status <> 'cancelled' AND deleted_at IS NULL", [a, b]);
      const cash = await api.cashSummary(date);
      const outstandingMinor = await one(`SELECT COALESCE(SUM(MAX(0, bal)),0) n FROM (
        SELECT (SELECT COALESCE(SUM(j.charge_minor),0) FROM jobs j WHERE j.order_id = o.id AND j.ownership = 'customer' AND j.status <> 'cancelled' AND j.deleted_at IS NULL)
             - (SELECT COALESCE(SUM(${NET}),0) FROM payments p WHERE p.order_id = o.id) AS bal FROM orders o WHERE o.deleted_at IS NULL)`);
      const lowStock = (await stock.stockList()).filter((s) => s.low).length;
      return { date, ordersToday, pendingJobs, readyJobs, completedToday, inputTodayBase, outputTodayBase,
        yieldBpToday: inputTodayBase > 0 && outputTodayBase > 0 ? Math.round((outputTodayBase * 10000) / inputTodayBase) : null,
        billedTodayMinor, collectedTodayMinor: cash.cashInMinor + cash.otherInMinor, expensesTodayMinor: cash.expensesMinor, outstandingMinor, lowStock };
    },

    /** Yield / wastage per processing definition for a date range (epoch ms). */
    async yieldReport(from: number, to: number) {
      const rows = await db.getAllAsync<any>(`
        SELECT j.definition_name name, COUNT(DISTINCT j.id) jobs,
          COALESCE(SUM(CASE WHEN l.role='input' THEN l.qty_base END),0) input,
          COALESCE(SUM(CASE WHEN l.role='output' THEN l.qty_base END),0) output,
          COALESCE(SUM(CASE WHEN l.role='byproduct' THEN l.qty_base END),0) byproduct,
          COALESCE(SUM(CASE WHEN l.role='waste' THEN l.qty_base END),0) waste
        FROM jobs j LEFT JOIN job_lines l ON l.job_id = j.id AND l.deleted_at IS NULL
        WHERE j.created_at >= ? AND j.created_at < ? AND j.status <> 'cancelled' AND j.deleted_at IS NULL GROUP BY j.definition_name ORDER BY j.definition_name`, [from, to]);
      return rows.map((r) => ({ name: r.name as string, jobs: r.jobs as number, inputBase: r.input as number, outputBase: r.output as number, byproductBase: r.byproduct as number, wasteBase: r.waste as number,
        yieldBp: r.input > 0 ? Math.round((r.output * 10000) / r.input) : 0, unaccountedBase: r.input - r.output - r.byproduct - r.waste }));
    },
    /** Profit and loss on a cash-and-billing basis: processing billed vs expenses (including stage costs). */
    async profitAndLoss(fromDate: string, toDate: string) {
      const [a] = dayRange(fromDate); const [, b] = dayRange(toDate);
      const billed = (await db.getFirstAsync<{ n: number }>("SELECT COALESCE(SUM(charge_minor),0) n FROM jobs WHERE created_at >= ? AND created_at < ? AND ownership = 'customer' AND status <> 'cancelled' AND deleted_at IS NULL", [a, b]))!.n;
      const exp = (await db.getFirstAsync<{ n: number }>('SELECT COALESCE(SUM(amount_minor),0) n FROM expenses WHERE on_date >= ? AND on_date <= ? AND deleted_at IS NULL', [fromDate, toDate]))!.n;
      return { processingIncomeMinor: billed, expensesMinor: exp, profitMinor: billed - exp };
    },
  };
  return api;
}

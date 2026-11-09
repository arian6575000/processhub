// Orders (single / master token), jobs, workflow execution, deliveries, custody, payments and customer ledgers.
import { Kernel, parse } from './kernel';
import { newId } from '../core/ids';
import { reconcile, JobLine, LineRole } from '../core/processing';
import { approveStage, completeStage, currentStageIndex, initState, overallStatus, rejectStage, reopenStage, skipStage, snapshotOf, startStage, WorkflowSnapshot, WorkflowState } from '../core/workflow';
import { computeCharge, ChargeResult, ExtraService, PricingPolicy } from '../core/pricing';
import { childToken, JobStatus, orderToken, paymentStatus, PaymentStatus, rollupStatus } from '../core/tokens';
import { assertCustodyOwnership, assertStockOwnership, Ownership } from '../core/ownership';
import { allocate } from '../core/payments';
import type { Job, JobDetail, JobRow, Settings } from './types';
import type { masterData } from './masterData';
import type { stockModule } from './stock';

type MD = ReturnType<typeof masterData>;
type ST = ReturnType<typeof stockModule>;

export interface NewJob {
  definitionId: string; ownership?: Ownership; inputs: { materialId: string; qtyBase: number }[];
  bags?: number; machineMinutes?: number; services?: ExtraService[]; discount?: PricingPolicy['discount']; notes?: string;
}
export interface NewOrder { mode: 'single' | 'master'; customerId?: string | null; walkInName?: string; walkInPhone?: string; notes?: string; userId?: string | null; jobs: NewJob[] }

export type JobAction =
  | { type: 'start'; idx: number; workerId?: string | null }
  | { type: 'complete'; idx: number; inputBase?: number; outputBase?: number; expenseMinor?: number; qcPassed?: boolean | null; note?: string }
  | { type: 'approve'; idx: number } | { type: 'reject'; idx: number; reason: string }
  | { type: 'reopen'; idx: number } | { type: 'skip'; idx: number; note?: string };

const JOB_SQL = `SELECT j.*, o.token AS order_token, o.customer_id AS customer_id,
  COALESCE(c.name, NULLIF(o.walk_in_name, ''), '') AS customer_name
  FROM jobs j JOIN orders o ON o.id = j.order_id LEFT JOIN customers c ON c.id = o.customer_id`;

export function ordersModule(k: Kernel, md: MD, stock: ST) {
  const db = k.db;

  const toJob = (r: any): Job => {
    const snap = parse<any>(r.pricing_snapshot, {});
    return {
      id: r.id, orderId: r.order_id, token: r.token, seqInOrder: r.seq_in_order, definitionId: r.definition_id, definitionName: r.definition_name,
      ownership: r.ownership, workflow: parse<WorkflowSnapshot>(r.workflow, { templateId: '', versionId: '', version: 0, stages: [] }),
      runtime: parse<WorkflowState>(r.runtime, { stages: [], history: [] }), status: r.status, inputBase: r.input_base, bags: r.bags,
      deliveredBase: r.delivered_base, chargeMinor: r.charge_minor, costMinor: r.cost_minor, stockPosted: !!r.stock_posted, notes: r.notes,
      charge: snap.result ?? null, byproductPolicy: snap.byproductPolicy ?? 'return_to_customer', createdAt: r.created_at, updatedAt: r.updated_at,
      customerId: r.customer_id ?? null, customerName: r.customer_name ?? '', orderToken: r.order_token,
    };
  };
  const loadRow = async (id: string) => {
    const r = await db.getFirstAsync<any>(`${JOB_SQL} WHERE j.id = ?`, [id]);
    if (!r) throw new Error('Job not found');
    return r;
  };
  const linesOf = async (jobId: string): Promise<JobRow[]> =>
    (await db.getAllAsync<any>('SELECT * FROM job_lines WHERE job_id = ? AND deleted_at IS NULL ORDER BY created_at, rowid', [jobId]))
      .map((l) => ({ id: l.id, materialId: l.material_id, role: l.role as LineRole, qtyBase: l.qty_base, stageIndex: l.stage_index }));

  const custody = async (job: { id: string; ownership: Ownership }, materialId: string, delta: number, reason: 'receive' | 'deliver' | 'return' | 'process_loss' | 'byproduct_to_business') => {
    assertCustodyOwnership(job.ownership);
    await k.insert('custody_ledger', { id: newId(), job_id: job.id, material_id: materialId, delta_base: delta, reason, at: k.now() });
  };
  const custodyHeld = async (jobId: string) => (await db.getFirstAsync<{ s: number }>('SELECT COALESCE(SUM(delta_base),0) s FROM custody_ledger WHERE job_id = ?', [jobId]))!.s;

  const refreshOrder = async (orderId: string) => {
    const kids = (await db.getAllAsync<{ status: JobStatus }>('SELECT status FROM jobs WHERE order_id = ? AND deleted_at IS NULL', [orderId])).map((r) => r.status);
    await k.update('orders', orderId, { status: rollupStatus(kids) });
  };

  const api = {
    // ---------------- creation ----------------
    async createOrder(o: NewOrder): Promise<{ orderId: string; token: string; jobIds: string[] }> {
      if (!o.jobs.length) throw new Error('Add at least one job');
      if (o.mode === 'single' && o.jobs.length !== 1) throw new Error('A single-token order has exactly one job');
      if (o.customerId && !(await md.getCustomer(o.customerId))) throw new Error('Customer not found');
      const orderId = newId(); const jobIds: string[] = []; let token = '';
      await k.tx(async () => {
        const seq = await k.nextSeq('order_seq', 1001);
        token = orderToken(k.deviceCode, seq);
        await k.insert('orders', { id: orderId, token, mode: o.mode, customer_id: o.customerId ?? null, walk_in_name: (o.walkInName ?? '').trim(), walk_in_phone: (o.walkInPhone ?? '').trim(), status: 'received', created_by: o.userId ?? null, notes: o.notes ?? '' });
        let n = 0;
        for (const j of o.jobs) {
          n++;
          const ownership: Ownership = j.ownership ?? 'customer';
          if (ownership === 'business' && o.customerId) throw new Error('Own-business production orders cannot belong to a customer');
          if (!j.inputs.length) throw new Error('Every job needs at least one input material');
          for (const i of j.inputs) if (!Number.isInteger(i.qtyBase) || i.qtyBase <= 0) throw new Error('Input quantity must be more than zero');
          const def = await md.getDefinition(j.definitionId);
          if (!def || !def.active) throw new Error('Processing definition not found');
          const inputBase = j.inputs.reduce((a, i) => a + i.qtyBase, 0);
          const snap = snapshotOf(await md.latestVersion(def.templateId));
          const runtime = initState(snap, { inputKg: inputBase / 1000, bags: j.bags ?? 0 });
          const stageCount = runtime.stages.filter((s) => s.status !== 'skipped').length;
          const rates = o.customerId ? await md.customerRates(o.customerId, def.id) : {};
          const result: ChargeResult = computeCharge(def.pricing, { inputBase, bags: j.bags ?? 0, machineMinutes: j.machineMinutes ?? 0, stageCount }, { rateOverrides: rates, services: j.services, discount: j.discount });
          const jobId = newId(); jobIds.push(jobId);
          const charge = ownership === 'customer' ? result.totalMinor : 0;
          await k.insert('jobs', {
            id: jobId, order_id: orderId, token: o.mode === 'single' ? token : childToken(token, n), seq_in_order: n, definition_id: def.id, definition_name: def.name, ownership,
            workflow: JSON.stringify(snap), runtime: JSON.stringify(runtime),
            pricing_snapshot: JSON.stringify({ policy: def.pricing, result, rates, byproductPolicy: def.byproductPolicy }),
            status: 'received', input_base: inputBase, bags: j.bags ?? 0, delivered_base: 0, charge_minor: charge, cost_minor: result.costMinor, stock_posted: 0, notes: j.notes ?? '',
          });
          for (const i of j.inputs) {
            const mat = await db.getFirstAsync<any>('SELECT id FROM materials WHERE id = ? AND deleted_at IS NULL', [i.materialId]);
            if (!mat) throw new Error('Material not found');
            await k.insert('job_lines', { id: newId(), job_id: jobId, role: 'input', material_id: i.materialId, qty_base: i.qtyBase, stage_index: null });
            if (ownership === 'customer') await custody({ id: jobId, ownership }, i.materialId, i.qtyBase, 'receive');
            else { assertStockOwnership(ownership); await stock.consume({ materialId: i.materialId, qtyBase: i.qtyBase, reason: 'production_out', refType: 'job', refId: jobId }); }
          }
          await k.logActivity(o.userId, 'job.create', 'jobs', jobId, token);
        }
        await refreshOrder(orderId);
      });
      return { orderId, token, jobIds };
    },

    // ---------------- reading ----------------
    async getJob(id: string): Promise<JobDetail> {
      const job = toJob(await loadRow(id));
      const lines = await linesOf(id);
      const settings: Settings = await k.getSettings();
      const recon = reconcile(lines, settings.toleranceBp);
      const byp = lines.filter((l) => l.role === 'byproduct').reduce((a, l) => a + l.qtyBase, 0);
      const deliverableBase = job.ownership === 'customer' ? recon.outputBase + (job.byproductPolicy === 'return_to_customer' ? byp : 0) : 0;
      return { ...job, lines, recon, deliverableBase };
    },
    async listJobs(f: { statuses?: JobStatus[]; orderId?: string; customerId?: string; limit?: number } = {}): Promise<Job[]> {
      const where: string[] = ['j.deleted_at IS NULL']; const p: any[] = [];
      if (f.statuses?.length) { where.push(`j.status IN (${f.statuses.map(() => '?').join(',')})`); p.push(...f.statuses); }
      if (f.orderId) { where.push('j.order_id = ?'); p.push(f.orderId); }
      if (f.customerId) { where.push('o.customer_id = ?'); p.push(f.customerId); }
      return (await db.getAllAsync<any>(`${JOB_SQL} WHERE ${where.join(' AND ')} ORDER BY j.created_at DESC, j.rowid DESC LIMIT ?`, [...p, f.limit ?? 200])).map(toJob);
    },
    async getOrder(id: string) {
      const o = await db.getFirstAsync<any>('SELECT o.*, c.name AS customer_name FROM orders o LEFT JOIN customers c ON c.id = o.customer_id WHERE o.id = ?', [id]);
      if (!o) throw new Error('Order not found');
      return { id: o.id as string, token: o.token as string, mode: o.mode as 'single' | 'master', status: o.status as JobStatus, customerId: (o.customer_id ?? null) as string | null,
        customerName: (o.customer_name || o.walk_in_name || '') as string, walkInPhone: o.walk_in_phone as string, notes: o.notes as string, createdAt: o.created_at as number, jobs: await api.listJobs({ orderId: id }) };
    },

    // ---------------- workflow execution ----------------
    async jobAction(jobId: string, a: JobAction, userId?: string | null) {
      await k.tx(async () => {
        const job = toJob(await loadRow(jobId));
        if (job.status !== 'received' && job.status !== 'in_progress') throw new Error('This job can no longer be changed');
        const now = k.now(); const snap = job.workflow; let st = job.runtime;
        switch (a.type) {
          case 'start': st = startStage(st, a.idx, { now, user: userId, workerId: a.workerId }); break;
          case 'complete': st = completeStage(snap, st, a.idx, { now, user: userId, inputBase: a.inputBase, outputBase: a.outputBase, expenseMinor: a.expenseMinor, qcPassed: a.qcPassed, note: a.note }); break;
          case 'approve': st = approveStage(st, a.idx, { now, user: userId ?? 'unknown' }); break;
          case 'reject': st = rejectStage(st, a.idx, { now, user: userId, reason: a.reason }); break;
          case 'reopen': st = reopenStage(st, a.idx, { now, user: userId }); break;
          case 'skip': st = skipStage(snap, st, a.idx, { now, user: userId, note: a.note }); break;
        }
        const ov = overallStatus(st);
        const status: JobStatus = ov === 'completed' ? 'ready' : ov === 'pending' ? 'received' : 'in_progress';
        await k.update('jobs', jobId, { runtime: JSON.stringify(st), status });
        if (a.type === 'complete' && (a.expenseMinor ?? 0) > 0) {
          await k.insert('expenses', { id: newId(), category: `Stage: ${snap.stages[a.idx].name}`, amount_minor: a.expenseMinor, on_date: new Date(now).toISOString().slice(0, 10), note: job.token, job_id: jobId });
        }
        await k.logActivity(userId, `job.${a.type}`, 'jobs', jobId, `${job.token} stage ${a.idx + 1}`);
        if (status === 'ready') await api.maybePostProduction(jobId);
        await refreshOrder(job.orderId);
      });
    },

    /** Replace the recorded outputs / byproducts / waste / intermediates of a job (inputs are never edited here). */
    async recordLines(jobId: string, lines: { materialId: string; role: Exclude<LineRole, 'input'>; qtyBase: number; stageIndex?: number | null }[], userId?: string | null) {
      await k.tx(async () => {
        const job = toJob(await loadRow(jobId));
        if (job.status === 'delivered' || job.status === 'cancelled' || job.status === 'partially_delivered') throw new Error('This job can no longer be changed');
        if (job.stockPosted) throw new Error('Production has been posted to stock; outputs are locked');
        for (const l of lines) {
          if (l.role === ('input' as LineRole)) throw new Error('Inputs cannot be edited');
          if (!Number.isInteger(l.qtyBase) || l.qtyBase < 0) throw new Error('Quantity must be zero or more');
        }
        const old = await db.getAllAsync<{ id: string }>("SELECT id FROM job_lines WHERE job_id = ? AND role <> 'input' AND deleted_at IS NULL", [jobId]);
        for (const o of old) await k.remove('job_lines', o.id);
        for (const l of lines) await k.insert('job_lines', { id: newId(), job_id: jobId, role: l.role, material_id: l.materialId, qty_base: l.qtyBase, stage_index: l.stageIndex ?? null });
        await k.logActivity(userId, 'job.record_lines', 'jobs', jobId, job.token);
        if (job.status === 'ready') { await api.maybePostProduction(jobId); await refreshOrder(job.orderId); }
      });
    },

    /** Own-business jobs: when ready and outputs are recorded, finished goods enter business stock (valued at consumed input cost). */
    async maybePostProduction(jobId: string) {
      const job = toJob(await loadRow(jobId));
      if (job.ownership !== 'business' || job.status !== 'ready' || job.stockPosted) return;
      assertStockOwnership(job.ownership);
      const lines = await linesOf(jobId);
      const outs = lines.filter((l) => l.role === 'output' && l.qtyBase > 0);
      if (!outs.length) return;
      const totalCost = (await db.getFirstAsync<{ s: number }>("SELECT COALESCE(SUM(-value_minor_delta),0) s FROM stock_ledger WHERE ref_id = ? AND reason = 'production_out'", [jobId]))!.s;
      const totalOut = outs.reduce((a, l) => a + l.qtyBase, 0);
      let left = totalCost;
      for (let i = 0; i < outs.length; i++) {
        const v = i === outs.length - 1 ? left : Math.floor((totalCost * outs[i].qtyBase) / totalOut);
        left -= v;
        await stock.post({ materialId: outs[i].materialId, delta: outs[i].qtyBase, value: v, reason: 'production_in', refType: 'job', refId: jobId });
      }
      for (const b of lines.filter((l) => l.role === 'byproduct' && l.qtyBase > 0)) await stock.post({ materialId: b.materialId, delta: b.qtyBase, value: 0, reason: 'byproduct', refType: 'job', refId: jobId });
      await k.update('jobs', jobId, { stock_posted: 1, status: 'delivered' });
    },

    // ---------------- delivery & cancellation (customer-owned jobs) ----------------
    async deliver(jobId: string, qtyBase: number, o: { note?: string; userId?: string | null } = {}) {
      await k.tx(async () => {
        const d = await api.getJob(jobId);
        if (d.ownership !== 'customer') throw new Error('Only customer jobs are delivered');
        if (d.status !== 'ready' && d.status !== 'partially_delivered') throw new Error('The job is not ready for delivery');
        if (!Number.isInteger(qtyBase) || qtyBase <= 0) throw new Error('Delivery quantity must be more than zero');
        if (d.deliveredBase + qtyBase > d.deliverableBase) throw new Error('Cannot deliver more than the processed quantity');
        const out = d.lines.find((l) => l.role === 'output') ?? d.lines[0];
        await k.insert('deliveries', { id: newId(), job_id: jobId, qty_base: qtyBase, at: k.now(), note: o.note ?? '', by_user: o.userId ?? null });
        await custody(d, out.materialId, -qtyBase, 'deliver');
        const delivered = d.deliveredBase + qtyBase, done = delivered >= d.deliverableBase;
        if (done) {
          if (d.byproductPolicy === 'keep_by_business') {
            for (const b of d.lines.filter((l) => l.role === 'byproduct' && l.qtyBase > 0)) {
              await custody(d, b.materialId, -b.qtyBase, 'byproduct_to_business');
              await stock.post({ materialId: b.materialId, delta: b.qtyBase, value: 0, reason: 'byproduct', refType: 'job', refId: jobId, note: 'Kept by business as agreed' });
            }
          }
          const held = await custodyHeld(jobId);
          if (held > 0) await custody(d, out.materialId, -held, 'process_loss');
        }
        await k.update('jobs', jobId, { delivered_base: delivered, status: done ? 'delivered' : 'partially_delivered' });
        await k.logActivity(o.userId, 'job.deliver', 'jobs', jobId, `${d.token} ${qtyBase}`);
        await refreshOrder(d.orderId);
      });
    },
    async cancelJob(jobId: string, userId?: string | null) {
      await k.tx(async () => {
        const d = await api.getJob(jobId);
        if (d.status === 'delivered' || d.status === 'partially_delivered' || d.status === 'cancelled') throw new Error('This job cannot be cancelled');
        if (d.ownership === 'customer') {
          const held = await custodyHeld(jobId);
          if (held > 0) await custody(d, d.lines.find((l) => l.role === 'input')!.materialId, -held, 'return');
        } else {
          if (d.stockPosted) throw new Error('Production has already been posted');
          const rows = await db.getAllAsync<any>("SELECT * FROM stock_ledger WHERE ref_id = ? AND reason = 'production_out'", [jobId]);
          for (const r of rows) await stock.post({ materialId: r.material_id, warehouseId: r.warehouse_id, delta: -r.delta_base, value: -r.value_minor_delta, reason: 'adjustment', refType: 'job', refId: jobId, note: 'Job cancelled' });
        }
        await k.update('jobs', jobId, { status: 'cancelled' });
        await k.logActivity(userId, 'job.cancel', 'jobs', jobId, d.token);
        await refreshOrder(d.orderId);
      });
    },
    custodyHeld,
    async custodyReport() {
      return db.getAllAsync<{ job_id: string; token: string; held: number }>(
        `SELECT c.job_id, j.token, SUM(c.delta_base) held FROM custody_ledger c JOIN jobs j ON j.id = c.job_id GROUP BY c.job_id HAVING held > 0 ORDER BY j.created_at DESC`);
    },
    currentStageIndex,

    // ---------------- payments (append-only, idempotent) ----------------
    async addPayment(p: { orderId?: string; jobId?: string; amountMinor: number; kind?: 'receipt' | 'refund' | 'advance'; method?: string; idempotencyKey?: string; note?: string; userId?: string | null }): Promise<{ id: string; duplicate: boolean }> {
      if (!Number.isInteger(p.amountMinor) || p.amountMinor <= 0) throw new Error('Payment must be more than zero');
      const key = p.idempotencyKey ?? newId();
      const dup = await db.getFirstAsync<{ id: string }>('SELECT id FROM payments WHERE idempotency_key = ?', [key]);
      if (dup) return { id: dup.id, duplicate: true };
      let orderId = p.orderId ?? null; const jobId = p.jobId ?? null;
      if (jobId) { const j = await db.getFirstAsync<any>('SELECT order_id, ownership FROM jobs WHERE id = ?', [jobId]); if (!j) throw new Error('Job not found'); if (j.ownership !== 'customer') throw new Error('Own-business jobs do not take customer payments'); orderId = j.order_id; }
      if (!orderId) throw new Error('A payment must belong to an order or a job');
      const o = await db.getFirstAsync<any>('SELECT customer_id FROM orders WHERE id = ?', [orderId]);
      if (!o) throw new Error('Order not found');
      const kind = p.kind ?? 'receipt';
      const id = newId();
      await k.tx(async () => {
        if (kind === 'refund') {
          const net = (await db.getFirstAsync<{ s: number }>(`SELECT COALESCE(SUM(CASE kind WHEN 'refund' THEN -amount_minor ELSE amount_minor END),0) s FROM payments WHERE order_id = ?${jobId ? ' AND job_id = ?' : ''}`, jobId ? [orderId, jobId] : [orderId]))!.s;
          if (p.amountMinor > net) throw new Error('Refund is more than the amount received');
        }
        await k.insert('payments', { id, order_id: orderId, job_id: jobId, customer_id: o.customer_id ?? null, amount_minor: p.amountMinor, kind, method: p.method ?? 'cash', idempotency_key: key, at: k.now(), note: p.note ?? '', by_user: p.userId ?? null });
        await k.logActivity(p.userId, `payment.${kind}`, 'payments', id, String(p.amountMinor));
      });
      return { id, duplicate: false };
    },
    async orderSummary(orderId: string) {
      const jobs = await db.getAllAsync<any>("SELECT id, token, charge_minor FROM jobs WHERE order_id = ? AND ownership = 'customer' AND status <> 'cancelled' AND deleted_at IS NULL ORDER BY seq_in_order", [orderId]);
      const rows = await db.getAllAsync<{ job_id: string | null; s: number }>(`SELECT job_id, SUM(CASE kind WHEN 'refund' THEN -amount_minor ELSE amount_minor END) s FROM payments WHERE order_id = ? GROUP BY job_id`, [orderId]);
      const explicit = new Map(rows.filter((r) => r.job_id).map((r) => [r.job_id!, r.s]));
      const pool = Math.max(0, rows.find((r) => !r.job_id)?.s ?? 0);
      const dues = jobs.map((j) => ({ id: j.id as string, dueMinor: Math.max(0, j.charge_minor - (explicit.get(j.id) ?? 0)) }));
      const alloc = pool > 0 ? allocate(pool, dues) : { allocations: [], advanceMinor: 0 };
      const byJob = new Map(alloc.allocations.map((a) => [a.id, a.amountMinor]));
      const list = jobs.map((j) => { const paid = (explicit.get(j.id) ?? 0) + (byJob.get(j.id) ?? 0); return { jobId: j.id as string, token: j.token as string, chargeMinor: j.charge_minor as number, paidMinor: paid, balanceMinor: j.charge_minor - paid, status: paymentStatus(j.charge_minor, paid) }; });
      const totalMinor = list.reduce((a, j) => a + j.chargeMinor, 0);
      const paidMinor = list.reduce((a, j) => a + j.paidMinor, 0) + alloc.advanceMinor;
      return { orderId, totalMinor, paidMinor, balanceMinor: totalMinor - paidMinor, advanceMinor: alloc.advanceMinor, status: paymentStatus(totalMinor, paidMinor) as PaymentStatus, jobs: list };
    },
    async customerLedger(customerId: string) {
      const charges = await db.getAllAsync<any>(`SELECT j.id, j.token, j.charge_minor, j.created_at FROM jobs j JOIN orders o ON o.id = j.order_id
        WHERE o.customer_id = ? AND j.ownership = 'customer' AND j.status <> 'cancelled' AND j.deleted_at IS NULL`, [customerId]);
      const pays = await db.getAllAsync<any>('SELECT id, kind, amount_minor, method, at, note FROM payments WHERE customer_id = ?', [customerId]);
      const entries = [
        ...charges.map((c) => ({ at: c.created_at as number, label: `Job ${c.token}`, debitMinor: c.charge_minor as number, creditMinor: 0 })),
        ...pays.map((p) => ({ at: p.at as number, label: p.kind === 'refund' ? 'Refund' : p.kind === 'advance' ? 'Advance' : 'Payment', debitMinor: p.kind === 'refund' ? p.amount_minor as number : 0, creditMinor: p.kind === 'refund' ? 0 : p.amount_minor as number })),
      ].sort((a, b) => a.at - b.at);
      let bal = 0;
      const withBal = entries.map((e) => { bal += e.debitMinor - e.creditMinor; return { ...e, balanceMinor: bal }; });
      const billedMinor = entries.reduce((a, e) => a + (e.label.startsWith('Job') ? e.debitMinor : 0), 0);
      return { entries: withBal, billedMinor, balanceMinor: bal, paidMinor: billedMinor - bal };
    },
  };
  return api;
}

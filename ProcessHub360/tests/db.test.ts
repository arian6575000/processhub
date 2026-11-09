import test from 'node:test';
import assert from 'node:assert/strict';
import { createNodeDb } from './nodeDb';
import { createRepo, Repo } from '../src/db/repo';
import { migrate } from '../src/db/schema';
import type { StageDef } from '../src/core/workflow';
import { emptyPolicy } from '../src/core/pricing';
import { OwnershipError } from '../src/core/ownership';
import type { SyncTransport } from '../src/core/sync';

let clock = new Date(2026, 10, 9, 12, 0, 0).getTime();
const tick = (ms = 1000) => (clock += ms);

const STAGES: StageDef[] = [
  { key: 'recv', name: 'Receiving', mandatory: true, requiresApproval: false, requiresQc: false },
  { key: 'grind', name: 'Grinding', mandatory: true, requiresApproval: false, requiresQc: true },
  { key: 'pack', name: 'Packaging', mandatory: false, requiresApproval: false, requiresQc: false },
];

async function setup() {
  const repo = await createRepo(createNodeDb(), { now: () => tick() });
  const wheat = await repo.md.saveMaterial({ name: 'Wheat', kind: 'raw' });
  const chili = await repo.md.saveMaterial({ name: 'Red chili', kind: 'raw' });
  const flour = await repo.md.saveMaterial({ name: 'Flour', kind: 'finished' });
  const spice = await repo.md.saveMaterial({ name: 'Chili powder', kind: 'finished' });
  const bran = await repo.md.saveMaterial({ name: 'Bran', kind: 'byproduct' });
  const dust = await repo.md.saveMaterial({ name: 'Dust', kind: 'waste' });
  const pricing = { ...emptyPolicy(), chargeRules: [{ id: 'grind', label: 'Grinding', kind: 'per_kg' as const, rateMinor: 300 }], minChargeMinor: 5000 };
  const mill = await repo.md.saveDefinition({ name: 'Wheat milling', stages: STAGES, pricing });
  const milling = mill.id;
  const spices = (await repo.md.saveDefinition({ name: 'Spice grinding', stages: STAGES, pricing })).id;
  const keep = (await repo.md.saveDefinition({ name: 'Bran kept', stages: STAGES, pricing, byproductPolicy: 'keep_by_business' })).id;
  const cust = await repo.md.saveCustomer({ name: 'Ali Khan', phone: '0300-1112223' });
  return { repo, wheat, chili, flour, spice, bran, dust, milling, spices, keep, cust };
}

async function runWorkflow(repo: Repo, jobId: string) {
  const job = await repo.orders.getJob(jobId);
  for (let i = 0; i < job.workflow.stages.length; i++) {
    await repo.orders.jobAction(jobId, { type: 'start', idx: i }, 'u1');
    await repo.orders.jobAction(jobId, { type: 'complete', idx: i, qcPassed: job.workflow.stages[i].requiresQc ? true : undefined }, 'u1');
  }
}

test('migrations are idempotent and keep data', async () => {
  const db = createNodeDb(); await migrate(db); await migrate(db);
  const repo = await createRepo(db); await repo.md.saveCustomer({ name: 'Keep me' });
  await migrate(db);
  assert.equal((await repo.md.listCustomers()).length, 1);
});

test('customer processing: single token, delivery in parts, payment in parts, custody and ledgers', async () => {
  const { repo, wheat, flour, bran, dust, milling, cust } = await setup();
  const { orderId, token, jobIds } = await repo.orders.createOrder({ mode: 'single', customerId: cust, jobs: [{ definitionId: milling, inputs: [{ materialId: wheat, qtyBase: 50000 }] }] });
  assert.match(token, /^[0-9A-F]{3}-1001$/);
  const jobId = jobIds[0];
  let job = await repo.orders.getJob(jobId);
  assert.equal(job.token, token); assert.equal(job.chargeMinor, 15000); assert.equal(job.status, 'received');
  assert.equal(await repo.orders.custodyHeld(jobId), 50000);
  await assert.rejects(repo.orders.deliver(jobId, 1000), /not ready/);

  await repo.orders.jobAction(jobId, { type: 'start', idx: 0 });
  assert.equal((await repo.orders.getJob(jobId)).status, 'in_progress');
  await runWorkflowFrom(repo, jobId, 0);
  job = await repo.orders.getJob(jobId); assert.equal(job.status, 'ready');

  await repo.orders.recordLines(jobId, [
    { materialId: flour, role: 'output', qtyBase: 42000 }, { materialId: bran, role: 'byproduct', qtyBase: 6000 }, { materialId: dust, role: 'waste', qtyBase: 2000 },
  ]);
  job = await repo.orders.getJob(jobId);
  assert.equal(job.recon.status, 'balanced'); assert.equal(job.recon.yieldBp, 8400); assert.equal(job.deliverableBase, 48000); // output + byproduct returned to customer

  await repo.orders.deliver(jobId, 20000);
  job = await repo.orders.getJob(jobId); assert.equal(job.status, 'partially_delivered');
  await assert.rejects(repo.orders.deliver(jobId, 40000), /more than/);
  await repo.orders.deliver(jobId, 28000);
  job = await repo.orders.getJob(jobId); assert.equal(job.status, 'delivered');
  assert.equal(await repo.orders.custodyHeld(jobId), 0);   // waste written off as process loss, nothing left held
  assert.equal((await repo.orders.getOrder(orderId)).status, 'delivered');

  // payments: partial, duplicate retry ignored, then settle
  const p1 = await repo.orders.addPayment({ jobId, amountMinor: 5000, idempotencyKey: 'pay-1' });
  const dup = await repo.orders.addPayment({ jobId, amountMinor: 5000, idempotencyKey: 'pay-1' });
  assert.equal(dup.duplicate, true); assert.equal(dup.id, p1.id);
  let sum = await repo.orders.orderSummary(orderId);
  assert.equal(sum.paidMinor, 5000); assert.equal(sum.balanceMinor, 10000); assert.equal(sum.status, 'partial');
  await repo.orders.addPayment({ orderId, amountMinor: 10000 });
  sum = await repo.orders.orderSummary(orderId); assert.equal(sum.status, 'paid');
  await assert.rejects(repo.orders.addPayment({ jobId, amountMinor: 99999999, kind: 'refund' }), /Refund is more/);
  const ledger = await repo.orders.customerLedger(cust);
  assert.equal(ledger.billedMinor, 15000); assert.equal(ledger.balanceMinor, 0); assert.equal(ledger.entries.length, 3);

  // ownership: nothing of this customer's wheat/flour ever reached business stock
  assert.equal((await repo.stock.stockList()).every((s) => s.qtyBase === 0), true);
  assert.equal((await repo.kernel.db.getFirstAsync<{ n: number }>('SELECT COUNT(*) n FROM stock_ledger'))!.n, 0);
});
async function runWorkflowFrom(repo: Repo, jobId: string, skipIdx: number) {
  const job = await repo.orders.getJob(jobId);
  for (let i = 0; i < job.workflow.stages.length; i++) {
    const st = (await repo.orders.getJob(jobId)).runtime.stages[i].status;
    if (st === 'pending') await repo.orders.jobAction(jobId, { type: 'start', idx: i });
    if (i === skipIdx || (await repo.orders.getJob(jobId)).runtime.stages[i].status === 'in_progress')
      await repo.orders.jobAction(jobId, { type: 'complete', idx: i, qcPassed: job.workflow.stages[i].requiresQc ? true : undefined });
  }
}

test('master token: independent child jobs, rollup, pooled partial payment', async () => {
  const { repo, wheat, chili, milling, spices, cust } = await setup();
  const { orderId, token, jobIds } = await repo.orders.createOrder({ mode: 'master', customerId: cust, jobs: [
    { definitionId: milling, inputs: [{ materialId: wheat, qtyBase: 50000 }] },
    { definitionId: spices, inputs: [{ materialId: chili, qtyBase: 10000 }] },
    { definitionId: milling, inputs: [{ materialId: wheat, qtyBase: 20000 }] },
  ] });
  const jobs = await repo.orders.listJobs({ orderId });
  assert.deepEqual(jobs.map((j) => j.token).sort(), [`${token}-01`, `${token}-02`, `${token}-03`]);
  assert.deepEqual(jobs.map((j) => j.chargeMinor).sort((a, b) => a - b), [5000, 6000, 15000]); // 3000 -> minimum 5000
  await repo.orders.addPayment({ orderId, amountMinor: 17000, note: 'pooled' });
  const s = await repo.orders.orderSummary(orderId);
  assert.equal(s.totalMinor, 26000); assert.equal(s.paidMinor, 17000); assert.equal(s.status, 'partial');
  assert.equal(s.jobs.find((j) => j.token.endsWith('-01'))!.status, 'paid');     // oldest job settled first
  assert.equal(s.jobs.find((j) => j.token.endsWith('-02'))!.status, 'partial');  // 2,000 of 5,000
  assert.equal(s.jobs.find((j) => j.token.endsWith('-03'))!.status, 'unpaid');
  await runWorkflow(repo, jobIds[0]);
  assert.equal((await repo.orders.getOrder(orderId)).status, 'in_progress');     // one ready, others received
  await assert.rejects(repo.orders.createOrder({ mode: 'single', jobs: [{ definitionId: milling, inputs: [{ materialId: wheat, qtyBase: 1 }] }, { definitionId: milling, inputs: [{ materialId: wheat, qtyBase: 1 }] }] }), /exactly one/);
});

test('quick walk-in order needs no registered customer', async () => {
  const { repo, wheat, milling } = await setup();
  const r = await repo.orders.createOrder({ mode: 'single', walkInName: 'Walk-in', jobs: [{ definitionId: milling, inputs: [{ materialId: wheat, qtyBase: 10000 }] }] });
  assert.equal((await repo.orders.getOrder(r.orderId)).customerName, 'Walk-in');
  const r2 = await repo.orders.createOrder({ mode: 'single', jobs: [{ definitionId: milling, inputs: [{ materialId: wheat, qtyBase: 10000 }] }] });
  assert.notEqual(r.token, r2.token);
});

test('workflow versioning: running jobs keep their snapshot, new jobs get the new version', async () => {
  const { repo, wheat, milling } = await setup();
  const a = (await repo.orders.createOrder({ mode: 'single', jobs: [{ definitionId: milling, inputs: [{ materialId: wheat, qtyBase: 10000 }] }] })).jobIds[0];
  const edited: StageDef[] = [...STAGES, { key: 'insp', name: 'Final inspection', mandatory: true, requiresApproval: true, requiresQc: true }];
  assert.equal((await repo.md.saveDefinition({ id: milling, name: 'Wheat milling', stages: edited, pricing: (await repo.md.getDefinition(milling))!.pricing })).version, 2);
  assert.equal((await repo.md.saveDefinition({ id: milling, name: 'Wheat milling', stages: edited, pricing: (await repo.md.getDefinition(milling))!.pricing })).version, 2); // unchanged stages -> no new version
  const b = (await repo.orders.createOrder({ mode: 'single', jobs: [{ definitionId: milling, inputs: [{ materialId: wheat, qtyBase: 10000 }] }] })).jobIds[0];
  const ja = await repo.orders.getJob(a), jb = await repo.orders.getJob(b);
  assert.equal(ja.workflow.version, 1); assert.equal(ja.workflow.stages.length, 3); assert.equal(ja.runtime.stages.length, 3);
  assert.equal(jb.workflow.version, 2); assert.equal(jb.workflow.stages.length, 4);
  await runWorkflow(repo, a); assert.equal((await repo.orders.getJob(a)).status, 'ready');   // v1 job completes without the new stage
});

test('stage approval, rejection, history and stage expenses', async () => {
  const { repo, wheat } = await setup();
  const stages: StageDef[] = [{ key: 's1', name: 'Cleaning', mandatory: true, requiresApproval: true, requiresQc: false }];
  const d = (await repo.md.saveDefinition({ name: 'Cleaning only', stages, pricing: emptyPolicy() })).id;
  const j = (await repo.orders.createOrder({ mode: 'single', jobs: [{ definitionId: d, inputs: [{ materialId: wheat, qtyBase: 1000 }] }] })).jobIds[0];
  await repo.orders.jobAction(j, { type: 'start', idx: 0 });
  await repo.orders.jobAction(j, { type: 'complete', idx: 0, expenseMinor: 700, outputBase: 900 });
  let job = await repo.orders.getJob(j); assert.equal(job.runtime.stages[0].status, 'awaiting_approval'); assert.equal(job.status, 'in_progress');
  await repo.orders.jobAction(j, { type: 'reject', idx: 0, reason: 'Dirty' });
  await repo.orders.jobAction(j, { type: 'reopen', idx: 0 });
  await repo.orders.jobAction(j, { type: 'start', idx: 0 });
  await repo.orders.jobAction(j, { type: 'complete', idx: 0 });
  await repo.orders.jobAction(j, { type: 'approve', idx: 0 }, 'owner');
  job = await repo.orders.getJob(j); assert.equal(job.status, 'ready');
  assert.ok(job.runtime.history.some((h) => h.to === 'rejected' && h.note === 'Dirty'));
  assert.equal((await repo.accounts.listExpenses('2000-01-01', '2100-01-01'))[0].amount_minor, 700);
  await assert.rejects(repo.orders.jobAction(j, { type: 'start', idx: 0 }), /can no longer be changed/);
});

test('own-business production: stock in, consume, finished goods valued at input cost, no negative stock', async () => {
  const { repo, wheat, flour, bran, milling } = await setup();
  await repo.stock.receiveStock({ materialId: wheat, qtyBase: 100000, valueMinor: 500000, reason: 'purchase', batchNo: 'B1' });
  await assert.rejects(repo.stock.receiveStock({ materialId: wheat, qtyBase: 1, valueMinor: 1, ownership: 'customer' }), OwnershipError);
  await assert.rejects(repo.orders.createOrder({ mode: 'single', jobs: [{ definitionId: milling, ownership: 'business', inputs: [{ materialId: wheat, qtyBase: 150000 }] }] }), /Not enough stock/);
  assert.equal((await repo.stock.position(wheat)).qtyBase, 100000);              // failed order rolled back completely
  assert.equal((await repo.kernel.db.getFirstAsync<{ n: number }>('SELECT COUNT(*) n FROM orders'))!.n, 0);
  const { jobIds } = await repo.orders.createOrder({ mode: 'single', jobs: [{ definitionId: milling, ownership: 'business', inputs: [{ materialId: wheat, qtyBase: 40000 }] }] });
  let pos = await repo.stock.position(wheat); assert.equal(pos.qtyBase, 60000); assert.equal(pos.valueMinor, 300000);
  assert.equal((await repo.orders.getJob(jobIds[0])).chargeMinor, 0);              // no customer charge for own production
  await repo.orders.recordLines(jobIds[0], [{ materialId: flour, role: 'output', qtyBase: 32000 }, { materialId: bran, role: 'byproduct', qtyBase: 6000 }]);
  await runWorkflow(repo, jobIds[0]);
  const job = await repo.orders.getJob(jobIds[0]); assert.equal(job.stockPosted, true); assert.equal(job.status, 'delivered');
  const f = await repo.stock.position(flour); assert.equal(f.qtyBase, 32000); assert.equal(f.valueMinor, 200000);  // 40 kg of wheat at Rs 50/kg
  assert.equal((await repo.stock.position(bran)).qtyBase, 6000);
  await assert.rejects(repo.orders.recordLines(jobIds[0], []), /can no longer be changed/);
  await assert.rejects(repo.orders.addPayment({ jobId: jobIds[0], amountMinor: 100 }), /Own-business/);
  await repo.stock.adjust({ materialId: wheat, deltaBase: -10000, reason: 'wastage' });
  assert.equal((await repo.stock.position(wheat)).qtyBase, 50000);
  await repo.stock.saveWarehouse('Shop'); const whs = await repo.stock.listWarehouses();
  await repo.stock.transfer({ materialId: wheat, from: 'main', to: whs.find((w) => w.name === 'Shop')!.id, qtyBase: 20000 });
  assert.equal((await repo.stock.position(wheat, 'main')).qtyBase, 30000); assert.equal((await repo.stock.position(wheat)).qtyBase, 50000);
});

test('cancelling a business job returns its stock; cancelling a customer job returns the customer material', async () => {
  const { repo, wheat, milling, cust } = await setup();
  await repo.stock.receiveStock({ materialId: wheat, qtyBase: 10000, valueMinor: 40000 });
  const b = (await repo.orders.createOrder({ mode: 'single', jobs: [{ definitionId: milling, ownership: 'business', inputs: [{ materialId: wheat, qtyBase: 10000 }] }] })).jobIds[0];
  assert.equal((await repo.stock.position(wheat)).qtyBase, 0);
  await repo.orders.cancelJob(b);
  const pos = await repo.stock.position(wheat); assert.equal(pos.qtyBase, 10000); assert.equal(pos.valueMinor, 40000);
  const c = (await repo.orders.createOrder({ mode: 'single', customerId: cust, jobs: [{ definitionId: milling, inputs: [{ materialId: wheat, qtyBase: 5000 }] }] })).jobIds[0];
  await repo.orders.cancelJob(c);
  assert.equal(await repo.orders.custodyHeld(c), 0);
  assert.equal((await repo.orders.customerLedger(cust)).billedMinor, 0);          // cancelled jobs are not billed
  assert.equal((await repo.stock.position(wheat)).qtyBase, 10000);                // customer wheat never touched stock
});

test('byproduct kept by the business moves from custody to business stock only at final delivery', async () => {
  const { repo, wheat, flour, bran, keep, cust } = await setup();
  const j = (await repo.orders.createOrder({ mode: 'single', customerId: cust, jobs: [{ definitionId: keep, inputs: [{ materialId: wheat, qtyBase: 50000 }] }] })).jobIds[0];
  await runWorkflow(repo, j);
  await repo.orders.recordLines(j, [{ materialId: flour, role: 'output', qtyBase: 40000 }, { materialId: bran, role: 'byproduct', qtyBase: 10000 }]);
  assert.equal((await repo.orders.getJob(j)).deliverableBase, 40000);
  assert.equal((await repo.stock.position(bran)).qtyBase, 0);
  await repo.orders.deliver(j, 40000);
  assert.equal((await repo.stock.position(bran)).qtyBase, 10000);
  assert.equal(await repo.orders.custodyHeld(j), 0);
  assert.equal((await repo.stock.position(flour)).qtyBase, 0);                    // the customer's flour is never business stock
});

test('customer-specific rates override the policy rate', async () => {
  const { repo, wheat, milling, cust } = await setup();
  await repo.md.setCustomerRate(cust, milling, 'grind', 200);
  const j = (await repo.orders.createOrder({ mode: 'single', customerId: cust, jobs: [{ definitionId: milling, inputs: [{ materialId: wheat, qtyBase: 50000 }] }] })).jobIds[0];
  assert.equal((await repo.orders.getJob(j)).chargeMinor, 10000);
});

test('dashboard, cash summary, closing, yield report and P&L use real data', async () => {
  const { repo, wheat, flour, milling, cust } = await setup();
  const j = (await repo.orders.createOrder({ mode: 'single', customerId: cust, jobs: [{ definitionId: milling, inputs: [{ materialId: wheat, qtyBase: 50000 }] }] })).jobIds[0];
  await runWorkflow(repo, j);
  await repo.orders.recordLines(j, [{ materialId: flour, role: 'output', qtyBase: 45000 }]);
  await repo.orders.addPayment({ jobId: j, amountMinor: 6000, method: 'cash' });
  await repo.orders.addPayment({ jobId: j, amountMinor: 1000, method: 'bank' });
  await repo.accounts.addExpense({ category: 'Electricity', amountMinor: 2000 });
  const d = await repo.accounts.dashboard();
  assert.equal(d.ordersToday, 1); assert.equal(d.readyJobs, 1); assert.equal(d.pendingJobs, 0);
  assert.equal(d.inputTodayBase, 50000); assert.equal(d.outputTodayBase, 45000); assert.equal(d.yieldBpToday, 9000);
  assert.equal(d.billedTodayMinor, 15000); assert.equal(d.collectedTodayMinor, 7000); assert.equal(d.expensesTodayMinor, 2000); assert.equal(d.outstandingMinor, 8000);
  const c = await repo.accounts.cashSummary(d.date); assert.equal(c.cashInMinor, 6000); assert.equal(c.otherInMinor, 1000);
  const close = await repo.accounts.closeCash(d.date, 3500); assert.equal(close.expectedMinor, 4000); assert.equal(close.differenceMinor, -500);
  const y = await repo.accounts.yieldReport(0, clock + 1e9); assert.equal(y[0].yieldBp, 9000); assert.equal(y[0].unaccountedBase, 5000);
  const pl = await repo.accounts.profitAndLoss(d.date, d.date); assert.equal(pl.profitMinor, 15000 - 2000);
});

test('users: roles, pin login and persistent lockout; last owner is protected', async () => {
  const { repo } = await setup();
  const owner = await repo.md.createUser({ name: 'Boss', roleId: 'owner', pin: '1234' });
  await assert.rejects(repo.md.createUser({ name: 'X', roleId: 'owner', pin: 'abcd' }), /PIN/);
  assert.equal((await repo.md.login(owner, '1234')).ok, true);
  for (let i = 0; i < 4; i++) assert.deepEqual(await repo.md.login(owner, '0000'), { ok: false, reason: 'wrong' });
  const locked = await repo.md.login(owner, '0000'); assert.equal(locked.ok === false && locked.reason, 'locked');
  assert.equal((await repo.md.login(owner, '1234')).ok, false);                    // correct PIN refused while locked
  await assert.rejects(repo.md.setUserActive(owner, false), /at least one active owner/);
  const role = (await repo.md.listRoles()).find((r) => r.id === 'cashier')!; assert.ok(role.system);
  await assert.rejects(repo.md.saveRole({ id: 'cashier', name: 'x', permissions: [] }), /System roles/);
});

test('offline sync: outbox is written with every change, retried with backoff, never double counted', async () => {
  const { repo, wheat, milling, cust } = await setup();
  await repo.orders.createOrder({ mode: 'single', customerId: cust, jobs: [{ definitionId: milling, inputs: [{ materialId: wheat, qtyBase: 10000 }] }] });
  const before = await repo.sync.summary(); assert.ok(before.pending > 5); assert.equal(before.sent, 0);
  const t0 = clock;
  const failing: SyncTransport = { push: async () => { throw new Error('offline'); } };
  const r1 = await repo.sync.run(failing, t0); assert.equal(r1.sent, 0); assert.ok(r1.failed > 0);
  assert.equal((await repo.sync.summary()).sent, 0);                               // local save is not "synced"
  assert.deepEqual(await repo.sync.run(failing, t0 + 100), { sent: 0, failed: 0, conflicts: 0 }); // still backing off
  const seen = new Set<string>(); let delivered = 0;
  const ok: SyncTransport = { push: async (batch) => { for (const e of batch) { if (!seen.has(e.idempotencyKey)) { seen.add(e.idempotencyKey); delivered++; } } return { accepted: batch.map((e) => e.idempotencyKey) }; } };
  let guard = 0; while ((await repo.sync.pending()) > 0 && guard++ < 50) await repo.sync.run(ok, t0 + 10 * 60 * 1000);
  const after = await repo.sync.summary(); assert.equal(after.pending, 0); assert.equal(after.sent, before.pending);
  assert.equal(delivered, before.pending);
  // a later edit creates a NEW outbox entry (new version), the old one stays 'sent'
  await repo.md.saveCustomer({ id: cust, name: 'Ali Khan Updated' });
  assert.equal(await repo.sync.pending(), 1);
  const conflictT: SyncTransport = { push: async (b) => ({ accepted: [], conflicts: b.map((e) => e.idempotencyKey) }) };
  await repo.sync.run(conflictT, t0 + 20 * 60 * 1000);
  assert.equal((await repo.sync.summary()).conflict, 1);
});

test('payments and ledgers cannot be edited through the repo (append-only) and ids are uuids', async () => {
  const { repo, wheat, milling, cust } = await setup();
  const j = (await repo.orders.createOrder({ mode: 'single', customerId: cust, jobs: [{ definitionId: milling, inputs: [{ materialId: wheat, qtyBase: 10000 }] }] })).jobIds[0];
  const p = await repo.orders.addPayment({ jobId: j, amountMinor: 1000 });
  assert.match(p.id, /^[0-9a-f-]{36}$/);
  assert.equal((repo.orders as any).updatePayment, undefined); assert.equal((repo.orders as any).deletePayment, undefined);
  await assert.rejects(repo.orders.addPayment({ jobId: j, amountMinor: 0 }), /more than zero/);
});

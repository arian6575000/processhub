import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMoney, mulDiv, percentOf, formatMoney } from '../src/core/money';
import { DEFAULT_UNITS, toBase, fromBase, convert, formatWeight } from '../src/core/units';
import { newId } from '../src/core/ids';
import { reconcile, stageTotals, expectedOutputs } from '../src/core/processing';
import { evalExpr } from '../src/core/expr';
import { computeCharge, emptyPolicy, PricingPolicy } from '../src/core/pricing';
import { orderToken, childToken, rollupStatus, paymentStatus } from '../src/core/tokens';
import { assertStockOwnership, assertCustodyOwnership, OwnershipError } from '../src/core/ownership';
import { allocate, netPaid } from '../src/core/payments';
import { receive, issue, emptyPosition, needsReorder } from '../src/core/inventory';
import { hashPin, samePin, lockoutMs } from '../src/core/pin';
import { hasPermission, SYSTEM_ROLES } from '../src/core/rbac';

const U = Object.fromEntries(DEFAULT_UNITS.map((u) => [u.id, u]));

test('money is integer paisa and parses safely', () => {
  assert.equal(parseMoney('12.5'), 1250);
  assert.equal(parseMoney('1,000'), 100000);
  assert.equal(parseMoney(0.1 + 0.2), 30);
  assert.throws(() => parseMoney('12.345'));
  assert.equal(mulDiv(1000, 1, 3), 333);
  assert.equal(percentOf(10050, 250), 251); // 2.5% of Rs 100.50 = 2.5125 -> 2.51
  assert.equal(formatMoney(123456789), 'Rs 1,234,567.89');
});

test('units: mann = 40 kg and conversions', () => {
  assert.equal(toBase(2, U.mann), 80000);
  assert.equal(fromBase(80000, U.kg), 80);
  assert.equal(convert(1, U.mann, U.kg), 40);
  assert.throws(() => convert(1, U.kg, U.pc));
  assert.equal(formatWeight(1500), '1.5 kg');
  assert.equal(formatWeight(750), '750 g');
});

test('ids are unique v4 uuids', () => {
  const a = newId(), b = newId();
  assert.notEqual(a, b);
  assert.match(a, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test('reconciliation: multi input / multi output with byproduct and waste', () => {
  const r = reconcile([
    { materialId: 'wheat', role: 'input', qtyBase: 50000 },
    { materialId: 'corn', role: 'input', qtyBase: 10000 },
    { materialId: 'flour', role: 'output', qtyBase: 45000 },
    { materialId: 'bran', role: 'byproduct', qtyBase: 10000 },
    { materialId: 'dust', role: 'waste', qtyBase: 5000 },
  ]);
  assert.equal(r.inputBase, 60000);
  assert.equal(r.accountedBase, 60000);
  assert.equal(r.status, 'balanced');
  assert.equal(r.yieldBp, 7500);
});

test('reconciliation flags unexplained loss and excess', () => {
  const loss = reconcile([{ materialId: 'a', role: 'input', qtyBase: 10000 }, { materialId: 'b', role: 'output', qtyBase: 8000 }]);
  assert.equal(loss.status, 'loss'); assert.equal(loss.unaccountedBase, 2000); assert.equal(loss.lossBp, 2000);
  const ex = reconcile([{ materialId: 'a', role: 'input', qtyBase: 10000 }, { materialId: 'b', role: 'output', qtyBase: 10500 }]);
  assert.equal(ex.status, 'excess');
  const tol = reconcile([{ materialId: 'a', role: 'input', qtyBase: 10000 }, { materialId: 'b', role: 'output', qtyBase: 9960 }]);
  assert.equal(tol.status, 'balanced'); // 0.4% inside the 0.5% tolerance
  assert.throws(() => reconcile([{ materialId: 'a', role: 'input', qtyBase: -1 }]));
});

test('stage totals and expected outputs', () => {
  const lines = [{ materialId: 'a', role: 'input' as const, qtyBase: 100, stageIndex: 1 }, { materialId: 'b', role: 'intermediate' as const, qtyBase: 90, stageIndex: 1 }];
  assert.deepEqual(stageTotals(lines, 1), { inputBase: 100, outputBase: 90, byproductBase: 0, wasteBase: 0 });
  assert.equal(expectedOutputs([{ materialId: 'f', role: 'output', yieldBp: 7500 }], 40000)[0].qtyBase, 30000);
});

test('formula evaluator is safe and correct', () => {
  assert.equal(evalExpr('kg * 2 + 10', { kg: 5 }), 20);
  assert.equal(evalExpr('max(kg*3, 100)', { kg: 5 }), 100);
  assert.equal(evalExpr('-(2+3)*2', {}), -10);
  assert.throws(() => evalExpr('process.exit()', {}));
  assert.throws(() => evalExpr('kg / 0', { kg: 1 }));
  assert.throws(() => evalExpr('unknown + 1', {}));
});

test('pricing: per kg, per mann, per bag, machine hour, minimum, discount, services, overrides', () => {
  const pol: PricingPolicy = {
    ...emptyPolicy(),
    chargeRules: [{ id: 'g', label: 'Grinding', kind: 'per_kg', rateMinor: 300 }, { id: 'b', label: 'Bags', kind: 'per_bag', rateMinor: 500 }],
    costRules: [{ id: 'e', label: 'Electricity', kind: 'per_machine_hour', rateMinor: 12000 }],
    minChargeMinor: 5000,
  };
  const inp = { inputBase: 50000, bags: 1, machineMinutes: 30 };
  const r = computeCharge(pol, inp);
  assert.equal(r.subtotalMinor, 15000 + 500);
  assert.equal(r.costMinor, 6000);
  assert.equal(r.totalMinor, 15500);
  assert.equal(r.marginMinor, 9500);
  // minimum charge
  const small = computeCharge(pol, { inputBase: 5000, bags: 0 });
  assert.equal(small.subtotalMinor, 1500); assert.equal(small.minAdjustmentMinor, 3500); assert.equal(small.totalMinor, 5000);
  // customer rate + service + percent discount
  const c = computeCharge(pol, inp, { rateOverrides: { g: 200 }, services: [{ label: 'Delivery', amountMinor: 1000 }], discount: { type: 'percent', value: 1000 } });
  assert.equal(c.totalMinor, Math.round((10000 + 500 + 1000) * 0.9));
  // per mann + expression
  const m = computeCharge({ ...emptyPolicy(), chargeRules: [{ id: 'm', label: 'Mann', kind: 'per_mann', rateMinor: 8000 }, { id: 'x', label: 'Formula', kind: 'expression', expr: 'max(kg * 1.5, 50)' }] }, { inputBase: 80000 });
  assert.equal(m.lines[0].amountMinor, 16000); assert.equal(m.lines[1].amountMinor, 12000);
  assert.equal(computeCharge(pol, inp, { discount: { type: 'fixed', value: 99999999 } }).totalMinor, 0); // discount can never exceed the bill
});

test('tokens and rollups', () => {
  assert.equal(orderToken('A', 1001), 'A-1001');
  assert.equal(childToken('A-1001', 3), 'A-1001-03');
  assert.equal(rollupStatus(['received', 'received']), 'received');
  assert.equal(rollupStatus(['ready', 'in_progress']), 'in_progress');
  assert.equal(rollupStatus(['ready', 'ready']), 'ready');
  assert.equal(rollupStatus(['delivered', 'ready']), 'partially_delivered');
  assert.equal(rollupStatus(['delivered', 'cancelled']), 'delivered');
  assert.equal(paymentStatus(1000, 0), 'unpaid'); assert.equal(paymentStatus(1000, 400), 'partial');
  assert.equal(paymentStatus(1000, 1000), 'paid'); assert.equal(paymentStatus(1000, 1200), 'overpaid');
});

test('ownership guard keeps customer material out of business stock', () => {
  assert.throws(() => assertStockOwnership('customer'), OwnershipError);
  assert.doesNotThrow(() => assertStockOwnership('business'));
  assert.throws(() => assertCustodyOwnership('business'), OwnershipError);
});

test('payment allocation: partial, oldest first, advance', () => {
  const r = allocate(1500, [{ id: 'j1', dueMinor: 1000 }, { id: 'j2', dueMinor: 1000 }]);
  assert.deepEqual(r.allocations, [{ id: 'j1', amountMinor: 1000 }, { id: 'j2', amountMinor: 500 }]);
  assert.equal(allocate(3000, [{ id: 'j1', dueMinor: 1000 }]).advanceMinor, 2000);
  assert.throws(() => allocate(0, []));
  assert.equal(netPaid([{ kind: 'receipt', amountMinor: 1000 }, { kind: 'refund', amountMinor: 300 }, { kind: 'advance', amountMinor: 200 }]), 900);
});

test('inventory: weighted average cost, no negative stock', () => {
  let p = receive(emptyPosition(), 100000, 400000);
  p = receive(p, 100000, 600000);
  const { position, costMinor } = issue(p, 50000);
  assert.equal(costMinor, 250000);
  assert.equal(position.qtyBase, 150000);
  assert.throws(() => issue(position, 999999));
  assert.equal(needsReorder(position, 200000), true);
});

test('pin hashing and lockout', () => {
  const h = hashPin('1234', 'abcd');
  assert.ok(samePin(h, hashPin('1234', 'abcd')));
  assert.ok(!samePin(h, hashPin('1235', 'abcd')));
  assert.equal(lockoutMs(4), 0); assert.equal(lockoutMs(5), 30000); assert.equal(lockoutMs(6), 60000); assert.equal(lockoutMs(30), 3600000);
});

test('rbac: system roles', () => {
  const role = (id: string) => SYSTEM_ROLES.find((r) => r.id === id)!;
  assert.ok(hasPermission(role('owner'), 'users.manage'));
  assert.ok(!hasPermission(role('admin'), 'users.manage'));
  assert.ok(hasPermission(role('worker'), 'jobs.operate'));
  assert.ok(!hasPermission(role('worker'), 'payments.collect'));
  assert.ok(!hasPermission(role('cashier'), 'payments.refund'));
});

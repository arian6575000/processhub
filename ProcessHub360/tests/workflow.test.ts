import test from 'node:test';
import assert from 'node:assert/strict';
import * as W from '../src/core/workflow';

const stages = (): W.StageDef[] => [
  { key: 'recv', name: 'Receiving', mandatory: true, requiresApproval: false, requiresQc: false },
  { key: 'clean', name: 'Cleaning', mandatory: false, requiresApproval: false, requiresQc: false },
  { key: 'dry', name: 'Drying', mandatory: false, requiresApproval: false, requiresQc: false, condition: { variable: 'inputKg', op: 'gte', value: 100 } },
  { key: 'grind', name: 'Grinding', mandatory: true, requiresApproval: false, requiresQc: true },
  { key: 'pack', name: 'Packaging', mandatory: true, requiresApproval: true, requiresQc: false },
];

test('template versioning never changes older versions or running jobs', () => {
  const v1 = W.publishVersion(null, 't1', stages(), 'v1', 1);
  assert.equal(v1.version, 1);
  const snap = W.snapshotOf(v1);
  const edited = stages(); edited.push({ key: 'insp', name: 'Final inspection', mandatory: true, requiresApproval: false, requiresQc: true });
  const v2 = W.publishVersion(v1, 't1', edited, 'v2', 2);
  assert.equal(v2.version, 2);
  assert.equal(v1.stages.length, 5);               // old version untouched
  assert.equal(snap.stages.length, 5);             // a job created from v1 keeps its snapshot
  assert.equal(W.snapshotOf(v2).stages.length, 6);
  snap.stages[0].name = 'changed';
  assert.equal(v1.stages[0].name, 'Receiving');    // snapshot is a deep copy
});

test('validation: need stages, names, unique keys', () => {
  assert.throws(() => W.validateStages([]));
  assert.throws(() => W.validateStages([{ key: 'a', name: ' ', mandatory: true, requiresApproval: false, requiresQc: false }]));
  assert.throws(() => W.validateStages([...stages(), stages()[0]]));
});

test('conditional stage is skipped when its condition fails', () => {
  const snap = W.snapshotOf(W.publishVersion(null, 't', stages(), 'v', 1));
  assert.equal(W.initState(snap, { inputKg: 50, bags: 1 }).stages[2].status, 'skipped');
  assert.equal(W.initState(snap, { inputKg: 150, bags: 3 }).stages[2].status, 'pending');
});

test('full lifecycle with qc, approval, rejection and rework; history is kept', () => {
  const snap = W.snapshotOf(W.publishVersion(null, 't', stages(), 'v', 1));
  let s = W.initState(snap, { inputKg: 50, bags: 1 });
  assert.equal(W.overallStatus(s), 'pending');
  assert.throws(() => W.startStage(s, 1, { now: 1 }));                    // cannot jump ahead of Receiving
  s = W.startStage(s, 0, { now: 1, user: 'u1' });
  s = W.completeStage(snap, s, 0, { now: 2, inputBase: 50000, outputBase: 50000 });
  s = W.skipStage(snap, s, 1, { now: 3 });                                // optional stage can be skipped
  assert.throws(() => W.skipStage(snap, s, 3, { now: 3 }));               // mandatory cannot
  s = W.startStage(s, 3, { now: 4 });                                     // dry is skipped, so grind is next
  assert.throws(() => W.completeStage(snap, s, 3, { now: 5 }));           // QC result required
  s = W.completeStage(snap, s, 3, { now: 5, qcPassed: false });           // failed QC -> rejected
  assert.equal(s.stages[3].status, 'rejected');
  assert.equal(W.overallStatus(s), 'rejected');
  s = W.reopenStage(s, 3, { now: 6 });
  s = W.startStage(s, 3, { now: 7 });
  s = W.completeStage(snap, s, 3, { now: 8, qcPassed: true, outputBase: 45000, expenseMinor: 700 });
  s = W.startStage(s, 4, { now: 9 });
  s = W.completeStage(snap, s, 4, { now: 10 });
  assert.equal(s.stages[4].status, 'awaiting_approval');                  // needs approval
  assert.equal(W.overallStatus(s), 'in_progress');
  s = W.approveStage(s, 4, { now: 11, user: 'owner' });
  assert.equal(W.overallStatus(s), 'completed');
  assert.ok(s.history.some((h) => h.to === 'rejected'));                  // rejection stays in history
  assert.ok(s.history.length >= 9);
  assert.equal(s.stages[3].expenseMinor, 700);
});

test('state functions are pure', () => {
  const snap = W.snapshotOf(W.publishVersion(null, 't', stages(), 'v', 1));
  const a = W.initState(snap, { inputKg: 1, bags: 1 });
  const b = W.startStage(a, 0, { now: 1 });
  assert.equal(a.stages[0].status, 'pending');
  assert.equal(b.stages[0].status, 'in_progress');
});

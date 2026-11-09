// Configurable multi-stage workflow engine. All functions are pure: they return a new state.
// Template versions are immutable; a job keeps the snapshot it was created with.
export interface StageCondition { variable: 'inputKg' | 'bags'; op: 'gte' | 'lte' | 'eq'; value: number }
export interface StageDef {
  key: string; name: string;
  mandatory: boolean; requiresApproval: boolean; requiresQc: boolean;
  condition?: StageCondition | null;       // stage only runs when the condition holds
  machineId?: string | null; assigneeRole?: string | null;
}
export interface TemplateVersion { id: string; templateId: string; version: number; stages: StageDef[]; createdAt: number }
export interface WorkflowSnapshot { templateId: string; versionId: string; version: number; stages: StageDef[] }

export type StageStatus = 'pending' | 'in_progress' | 'awaiting_approval' | 'completed' | 'rejected' | 'skipped';
export interface StageRuntime {
  key: string; status: StageStatus;
  startedAt?: number; completedAt?: number;
  inputBase?: number; outputBase?: number; expenseMinor?: number;
  workerId?: string | null; machineId?: string | null; qcPassed?: boolean | null; approvedBy?: string | null;
}
export interface HistoryEvent { at: number; stageKey: string; from: StageStatus | null; to: StageStatus; user?: string | null; note?: string }
export interface WorkflowState { stages: StageRuntime[]; history: HistoryEvent[] }
export type OverallStatus = 'pending' | 'in_progress' | 'completed' | 'rejected';

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

export function validateStages(stages: StageDef[]) {
  if (!stages.length) throw new Error('A workflow needs at least one stage');
  const keys = new Set<string>();
  for (const s of stages) {
    if (!s.name.trim()) throw new Error('Every stage needs a name');
    if (!s.key || keys.has(s.key)) throw new Error('Stage keys must be unique');
    keys.add(s.key);
  }
}

/** Publishing never edits an old version: it creates version N+1. */
export function publishVersion(prev: TemplateVersion | null, templateId: string, stages: StageDef[], id: string, now: number): TemplateVersion {
  validateStages(stages);
  return { id, templateId, version: prev ? prev.version + 1 : 1, stages: clone(stages), createdAt: now };
}
export const snapshotOf = (v: TemplateVersion): WorkflowSnapshot => ({ templateId: v.templateId, versionId: v.id, version: v.version, stages: clone(v.stages) });

export interface WorkflowContext { inputKg: number; bags: number }
const condHolds = (c: StageCondition | null | undefined, ctx: WorkflowContext) => {
  if (!c) return true;
  const v = ctx[c.variable];
  return c.op === 'gte' ? v >= c.value : c.op === 'lte' ? v <= c.value : v === c.value;
};

export function initState(snap: WorkflowSnapshot, ctx: WorkflowContext): WorkflowState {
  return {
    history: [],
    stages: snap.stages.map((s) => ({
      key: s.key, status: condHolds(s.condition, ctx) ? 'pending' : 'skipped', machineId: s.machineId ?? null,
    })),
  };
}

function patch(state: WorkflowState, idx: number, to: StageStatus, now: number, user: string | null | undefined, note: string | undefined, extra: Partial<StageRuntime> = {}): WorkflowState {
  const cur = state.stages[idx];
  if (!cur) throw new Error('No such stage');
  const next = clone(state);
  next.stages[idx] = { ...cur, ...extra, status: to };
  next.history.push({ at: now, stageKey: cur.key, from: cur.status, to, user: user ?? null, note });
  return next;
}

const prevOk = (state: WorkflowState, idx: number) => state.stages.slice(0, idx).every((s) => s.status === 'completed' || s.status === 'skipped');

export function startStage(state: WorkflowState, idx: number, o: { now: number; user?: string | null; workerId?: string | null; machineId?: string | null }): WorkflowState {
  const s = state.stages[idx];
  if (!s || s.status !== 'pending') throw new Error('Only a pending stage can be started');
  if (!prevOk(state, idx)) throw new Error('Finish the earlier stages first');
  return patch(state, idx, 'in_progress', o.now, o.user, undefined, { startedAt: o.now, workerId: o.workerId ?? null, machineId: o.machineId ?? s.machineId ?? null });
}

export function completeStage(snap: WorkflowSnapshot, state: WorkflowState, idx: number,
  o: { now: number; user?: string | null; inputBase?: number; outputBase?: number; expenseMinor?: number; qcPassed?: boolean | null; note?: string }): WorkflowState {
  const def = snap.stages[idx], s = state.stages[idx];
  if (!s || s.status !== 'in_progress') throw new Error('Only a stage in progress can be completed');
  if (def.requiresQc && (o.qcPassed === undefined || o.qcPassed === null)) throw new Error('Quality check result is required for this stage');
  const extra: Partial<StageRuntime> = { inputBase: o.inputBase, outputBase: o.outputBase, expenseMinor: o.expenseMinor, qcPassed: o.qcPassed ?? null, completedAt: o.now };
  if (def.requiresQc && o.qcPassed === false) return patch(state, idx, 'rejected', o.now, o.user, o.note ?? 'Quality check failed', extra);
  if (def.requiresApproval) return patch(state, idx, 'awaiting_approval', o.now, o.user, o.note, extra);
  return patch(state, idx, 'completed', o.now, o.user, o.note, extra);
}

export function approveStage(state: WorkflowState, idx: number, o: { now: number; user: string }): WorkflowState {
  if (state.stages[idx]?.status !== 'awaiting_approval') throw new Error('This stage is not waiting for approval');
  return patch(state, idx, 'completed', o.now, o.user, 'Approved', { approvedBy: o.user });
}
export function rejectStage(state: WorkflowState, idx: number, o: { now: number; user?: string | null; reason: string }): WorkflowState {
  const st = state.stages[idx]?.status;
  if (st !== 'in_progress' && st !== 'awaiting_approval') throw new Error('Only an active stage can be rejected');
  return patch(state, idx, 'rejected', o.now, o.user, o.reason);
}
/** Rework: a rejected stage goes back to pending. The rejection stays in the history. */
export function reopenStage(state: WorkflowState, idx: number, o: { now: number; user?: string | null }): WorkflowState {
  if (state.stages[idx]?.status !== 'rejected') throw new Error('Only a rejected stage can be reopened');
  return patch(state, idx, 'pending', o.now, o.user, 'Reopened for rework', { completedAt: undefined, qcPassed: null });
}
export function skipStage(snap: WorkflowSnapshot, state: WorkflowState, idx: number, o: { now: number; user?: string | null; note?: string }): WorkflowState {
  if (snap.stages[idx]?.mandatory) throw new Error('A mandatory stage cannot be skipped');
  if (state.stages[idx]?.status !== 'pending') throw new Error('Only a pending stage can be skipped');
  return patch(state, idx, 'skipped', o.now, o.user, o.note);
}

export function overallStatus(state: WorkflowState): OverallStatus {
  const live = state.stages.filter((s) => s.status !== 'skipped');
  if (live.some((s) => s.status === 'rejected')) return 'rejected';
  if (live.length && live.every((s) => s.status === 'completed')) return 'completed';
  if (live.every((s) => s.status === 'pending')) return 'pending';
  return 'in_progress';
}
export const currentStageIndex = (state: WorkflowState): number =>
  state.stages.findIndex((s) => s.status === 'in_progress' || s.status === 'awaiting_approval' || s.status === 'rejected' || s.status === 'pending');

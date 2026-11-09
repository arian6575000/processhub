// Generic multi-input / multi-output processing maths. No material or industry is hardcoded.
export type LineRole = 'input' | 'output' | 'intermediate' | 'byproduct' | 'waste';
export interface JobLine { materialId: string; role: LineRole; qtyBase: number; stageIndex?: number | null }

export type ReconStatus = 'balanced' | 'loss' | 'excess';
export interface Reconciliation {
  inputBase: number; outputBase: number; byproductBase: number; wasteBase: number;
  accountedBase: number; unaccountedBase: number;
  yieldBp: number;          // output / input, in basis points (10000 = 100%)
  lossBp: number;           // (input - output) / input
  status: ReconStatus;
}

export function validateLines(lines: JobLine[]) {
  for (const l of lines) {
    if (!l.materialId) throw new Error('Line needs a material');
    if (!Number.isInteger(l.qtyBase) || l.qtyBase < 0) throw new Error('Line quantity must be a whole number of base units >= 0');
  }
}

const sum = (lines: JobLine[], role: LineRole) => lines.filter((l) => l.role === role).reduce((a, l) => a + l.qtyBase, 0);

/** toleranceBp: unaccounted difference up to this share of the input still counts as balanced (default 0.5%). */
export function reconcile(lines: JobLine[], toleranceBp = 50): Reconciliation {
  validateLines(lines);
  const inputBase = sum(lines, 'input');
  const outputBase = sum(lines, 'output');
  const byproductBase = sum(lines, 'byproduct');
  const wasteBase = sum(lines, 'waste');
  const accountedBase = outputBase + byproductBase + wasteBase;
  const unaccountedBase = inputBase - accountedBase;
  const bp = (n: number) => (inputBase > 0 ? Math.round((n * 10000) / inputBase) : 0);
  const tol = Math.round((inputBase * toleranceBp) / 10000);
  let status: ReconStatus = 'balanced';
  if (unaccountedBase > tol) status = 'loss';
  else if (unaccountedBase < -tol) status = 'excess';
  return { inputBase, outputBase, byproductBase, wasteBase, accountedBase, unaccountedBase, yieldBp: bp(outputBase), lossBp: bp(inputBase - outputBase), status };
}

/** Stage-wise totals for stage-level input/output tracking. */
export function stageTotals(lines: JobLine[], stageIndex: number) {
  const s = lines.filter((l) => l.stageIndex === stageIndex);
  return { inputBase: sum(s, 'input'), outputBase: sum(s, 'output') + sum(s, 'intermediate'), byproductBase: sum(s, 'byproduct'), wasteBase: sum(s, 'waste') };
}

export interface ExpectedOutput { materialId: string; role: Exclude<LineRole, 'input'>; yieldBp: number } // share of total input weight
export function expectedOutputs(spec: ExpectedOutput[], inputBase: number): JobLine[] {
  return spec.map((o) => ({ materialId: o.materialId, role: o.role, qtyBase: Math.round((inputBase * o.yieldBp) / 10000) }));
}

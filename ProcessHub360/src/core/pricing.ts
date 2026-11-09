// Configurable pricing + cost engine. Each processing definition owns its own policy; nothing is universal.
import { Minor, mulDiv, percentOf, sumMinor } from './money';
import { evalExpr } from './expr';

export type RuleKind = 'per_kg' | 'per_mann' | 'per_gram' | 'per_bag' | 'fixed' | 'per_machine_hour' | 'per_stage' | 'expression';
export interface PriceRule {
  id: string; label: string; kind: RuleKind;
  rateMinor?: number;     // paisa per unit (not used by 'expression')
  expr?: string;          // for 'expression': result in rupees, vars: kg, mann, g, bags, hours, stages, output_kg
}
export interface PricingPolicy {
  chargeRules: PriceRule[];      // what the customer pays
  costRules: PriceRule[];        // internal cost (labour, electricity, packaging...) for margin reports
  minChargeMinor: number;
  discount?: { type: 'percent' | 'fixed'; value: number } | null;   // percent value in basis points
}
export interface PricingInput { inputBase: number; outputBase?: number; bags?: number; machineMinutes?: number; stageCount?: number }
export interface ExtraService { label: string; amountMinor: Minor }
export interface ChargeLine { ruleId: string; label: string; amountMinor: Minor }
export interface ChargeResult {
  lines: ChargeLine[]; subtotalMinor: Minor; minAdjustmentMinor: Minor; services: ExtraService[];
  discountMinor: Minor; totalMinor: Minor; costLines: ChargeLine[]; costMinor: Minor; marginMinor: Minor;
}

export const emptyPolicy = (): PricingPolicy => ({ chargeRules: [], costRules: [], minChargeMinor: 0, discount: null });

function ruleAmount(r: PriceRule, i: PricingInput, rateOverride?: number): Minor {
  const rate = rateOverride ?? r.rateMinor ?? 0;
  const bags = i.bags ?? 0, hours = (i.machineMinutes ?? 0) / 60, stages = i.stageCount ?? 0;
  switch (r.kind) {
    case 'per_kg': return mulDiv(rate, i.inputBase, 1000);
    case 'per_mann': return mulDiv(rate, i.inputBase, 40000);
    case 'per_gram': return rate * i.inputBase;
    case 'per_bag': return rate * bags;
    case 'fixed': return rate;
    case 'per_machine_hour': return mulDiv(rate, i.machineMinutes ?? 0, 60);
    case 'per_stage': return rate * stages;
    case 'expression': {
      if (!r.expr) throw new Error('Formula rule needs an expression');
      const rupees = evalExpr(r.expr, { kg: i.inputBase / 1000, mann: i.inputBase / 40000, g: i.inputBase, bags, hours, stages, output_kg: (i.outputBase ?? 0) / 1000 });
      return Math.round(rupees * 100);
    }
  }
}

/** rateOverrides: ruleId -> paisa rate, used for customer-specific rates. */
export function computeCharge(policy: PricingPolicy, input: PricingInput, o: { rateOverrides?: Record<string, number>; services?: ExtraService[]; discount?: PricingPolicy['discount'] } = {}): ChargeResult {
  const lines = policy.chargeRules.map((r) => ({ ruleId: r.id, label: r.label, amountMinor: ruleAmount(r, input, o.rateOverrides?.[r.id]) }));
  const subtotalMinor = sumMinor(lines.map((l) => l.amountMinor));
  const services = o.services ?? [];
  const minAdjustmentMinor = lines.length && subtotalMinor < policy.minChargeMinor ? policy.minChargeMinor - subtotalMinor : 0;
  const gross = subtotalMinor + minAdjustmentMinor + sumMinor(services.map((s) => s.amountMinor));
  const d = o.discount === undefined ? policy.discount : o.discount;
  const discountMinor = d ? Math.min(gross, d.type === 'percent' ? percentOf(gross, d.value) : d.value) : 0;
  const totalMinor = gross - discountMinor;
  const costLines = policy.costRules.map((r) => ({ ruleId: r.id, label: r.label, amountMinor: ruleAmount(r, input) }));
  const costMinor = sumMinor(costLines.map((l) => l.amountMinor));
  return { lines, subtotalMinor, minAdjustmentMinor, services, discountMinor, totalMinor, costLines, costMinor, marginMinor: totalMinor - costMinor };
}

// Business-owned stock only. Weighted-average valuation; no negative stock unless explicitly allowed.
import { Minor, mulDiv } from './money';

export interface StockPosition { qtyBase: number; valueMinor: Minor }
export const emptyPosition = (): StockPosition => ({ qtyBase: 0, valueMinor: 0 });

export function receive(p: StockPosition, qtyBase: number, valueMinor: Minor): StockPosition {
  if (!Number.isInteger(qtyBase) || qtyBase <= 0) throw new Error('Quantity must be positive');
  if (valueMinor < 0) throw new Error('Value cannot be negative');
  return { qtyBase: p.qtyBase + qtyBase, valueMinor: p.valueMinor + valueMinor };
}

/** Returns the new position and the cost of the issued quantity at the current average. */
export function issue(p: StockPosition, qtyBase: number, allowNegative = false): { position: StockPosition; costMinor: Minor } {
  if (!Number.isInteger(qtyBase) || qtyBase <= 0) throw new Error('Quantity must be positive');
  if (qtyBase > p.qtyBase && !allowNegative) throw new Error('Not enough stock');
  const costMinor = p.qtyBase > 0 ? mulDiv(p.valueMinor, Math.min(qtyBase, p.qtyBase), p.qtyBase) : 0;
  return { position: { qtyBase: p.qtyBase - qtyBase, valueMinor: p.valueMinor - costMinor }, costMinor };
}

export const needsReorder = (p: StockPosition, minBase: number) => minBase > 0 && p.qtyBase <= minBase;
export const averageCostPerKg = (p: StockPosition): Minor => (p.qtyBase > 0 ? mulDiv(p.valueMinor, 1000, p.qtyBase) : 0);

import { Minor } from './money';

export interface Due { id: string; dueMinor: Minor }
export interface Allocation { id: string; amountMinor: Minor }

/** Spreads a payment over dues in the given order (oldest first). Anything left over is an advance. */
export function allocate(amountMinor: Minor, dues: Due[]): { allocations: Allocation[]; advanceMinor: Minor } {
  if (!Number.isInteger(amountMinor) || amountMinor <= 0) throw new Error('Payment must be a positive amount');
  let left = amountMinor;
  const allocations: Allocation[] = [];
  for (const d of dues) {
    if (left <= 0) break;
    const take = Math.min(left, Math.max(0, d.dueMinor));
    if (take > 0) { allocations.push({ id: d.id, amountMinor: take }); left -= take; }
  }
  return { allocations, advanceMinor: left };
}

export interface PaymentRow { kind: 'receipt' | 'refund' | 'advance'; amountMinor: Minor }
/** Net money received: receipts and advances add, refunds subtract. */
export const netPaid = (rows: PaymentRow[]): Minor => rows.reduce((a, r) => a + (r.kind === 'refund' ? -r.amountMinor : r.amountMinor), 0);

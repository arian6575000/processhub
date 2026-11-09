// Token numbers carry a device code so tokens created offline on two phones can never collide.
export type JobStatus = 'received' | 'in_progress' | 'ready' | 'partially_delivered' | 'delivered' | 'cancelled';

export const orderToken = (deviceCode: string, seq: number) => `${deviceCode}-${seq}`;
export const childToken = (orderTok: string, n: number) => `${orderTok}-${String(n).padStart(2, '0')}`;

/** Overall status of a master order from its child jobs. */
export function rollupStatus(children: JobStatus[]): JobStatus {
  const live = children.filter((s) => s !== 'cancelled');
  if (!children.length || !live.length) return 'cancelled';
  if (live.every((s) => s === 'delivered')) return 'delivered';
  if (live.some((s) => s === 'delivered' || s === 'partially_delivered')) return 'partially_delivered';
  if (live.every((s) => s === 'ready')) return 'ready';
  if (live.some((s) => s !== 'received')) return 'in_progress';
  return 'received';
}

export type PaymentStatus = 'unpaid' | 'partial' | 'paid' | 'overpaid';
export function paymentStatus(totalMinor: number, paidMinor: number): PaymentStatus {
  if (paidMinor <= 0) return totalMinor > 0 ? 'unpaid' : 'paid';
  if (paidMinor < totalMinor) return 'partial';
  return paidMinor === totalMinor ? 'paid' : 'overpaid';
}

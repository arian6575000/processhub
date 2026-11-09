// Customer-owned material and business-owned stock live in separate ledgers. This guard is the single gate.
export type Ownership = 'customer' | 'business';
export class OwnershipError extends Error {}

export type LedgerKind = 'custody' | 'stock';
export const ledgerFor = (o: Ownership): LedgerKind => (o === 'customer' ? 'custody' : 'stock');

/** Throws if customer material is about to enter the business stock ledger. */
export function assertStockOwnership(o: Ownership) {
  if (o !== 'business') throw new OwnershipError('Customer-owned material cannot be counted as business stock');
}
export function assertCustodyOwnership(o: Ownership) {
  if (o !== 'customer') throw new OwnershipError('Business stock cannot be posted to the customer custody ledger');
}

// Quantities are stored as integers in a base unit per dimension (grams / pieces / millilitres).
export type Dimension = 'weight' | 'count' | 'volume';
export interface UnitDef { id: string; name: string; dimension: Dimension; factor: number } // factor = base units per 1 unit

export const BASE_UNIT: Record<Dimension, string> = { weight: 'g', count: 'pc', volume: 'ml' };

export const DEFAULT_UNITS: UnitDef[] = [
  { id: 'g', name: 'Gram', dimension: 'weight', factor: 1 },
  { id: 'kg', name: 'KG', dimension: 'weight', factor: 1000 },
  { id: 'mann', name: 'Mann (40 KG)', dimension: 'weight', factor: 40000 },
  { id: 'qtl', name: 'Quintal (100 KG)', dimension: 'weight', factor: 100000 },
  { id: 'ton', name: 'Ton', dimension: 'weight', factor: 1000000 },
  { id: 'pc', name: 'Piece / Bag', dimension: 'count', factor: 1 },
  { id: 'ml', name: 'Millilitre', dimension: 'volume', factor: 1 },
  { id: 'l', name: 'Litre', dimension: 'volume', factor: 1000 },
];

export function toBase(qty: number, unit: UnitDef): number {
  if (!Number.isFinite(qty) || qty < 0) throw new Error('Quantity must be zero or more');
  return Math.round(qty * unit.factor);
}
export const fromBase = (base: number, unit: UnitDef): number => base / unit.factor;

export function convert(qty: number, from: UnitDef, to: UnitDef): number {
  if (from.dimension !== to.dimension) throw new Error(`Cannot convert ${from.dimension} to ${to.dimension}`);
  return (qty * from.factor) / to.factor;
}

export function formatQty(base: number, unit: UnitDef): string {
  const v = fromBase(base, unit);
  const s = Number.isInteger(v) ? String(v) : v.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
  return `${s} ${unit.id}`;
}

/** Compact weight text, picks kg for >= 1 kg. */
export function formatWeight(g: number): string {
  if (Math.abs(g) >= 1000) { const kg = g / 1000; return `${Number.isInteger(kg) ? kg : kg.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')} kg`; }
  return `${g} g`;
}

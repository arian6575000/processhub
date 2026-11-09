// Money is always an integer number of paisa ("minor units"). Never store or add floats.
export type Minor = number;

export function parseMoney(input: string | number): Minor {
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) throw new Error('Invalid amount');
    return Math.round((input + Number.EPSILON) * 100);
  }
  const s = input.trim().replace(/,/g, '');
  if (!/^-?\d+(\.\d{1,2})?$/.test(s)) throw new Error('Invalid amount');
  const neg = s.startsWith('-');
  const [w, f = ''] = s.replace('-', '').split('.');
  const v = parseInt(w, 10) * 100 + parseInt((f + '00').slice(0, 2), 10);
  return neg ? -v : v;
}

/** amount * num / den, rounded half away from zero, integer result. */
export function mulDiv(amount: Minor, num: number, den: number): Minor {
  if (den === 0) throw new Error('Division by zero');
  const x = (amount * num) / den;
  return x < 0 ? -Math.round(-x) : Math.round(x);
}

/** Percentage in basis points (100 bp = 1%). */
export const percentOf = (amount: Minor, bp: number): Minor => mulDiv(amount, bp, 10000);

export const sumMinor = (xs: Minor[]): Minor => xs.reduce((a, b) => a + b, 0);

export function formatMoney(minor: Minor, currency = 'Rs'): string {
  const neg = minor < 0;
  const abs = Math.abs(minor);
  const whole = Math.floor(abs / 100);
  const frac = abs % 100;
  const w = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${neg ? '-' : ''}${currency} ${w}${frac ? '.' + String(frac).padStart(2, '0') : ''}`;
}

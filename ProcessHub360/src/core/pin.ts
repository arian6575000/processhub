// Salted, stretched PIN hashing (tweetnacl SHA-512) + persistent lockout policy.
import nacl from 'tweetnacl';

const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
export function hashPin(pin: string, saltHex: string): string {
  let h = nacl.hash(new TextEncoder().encode(`processhub360-pin-v1:${saltHex}:${pin}`));
  for (let i = 0; i < 3000; i++) h = nacl.hash(h);
  return hex(h);
}
export const samePin = (a: string, b: string) => { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; };
export const validPinFormat = (pin: string) => /^\d{4,8}$/.test(pin);

/** 0 for the first 4 failures, then 30s doubling, capped at 1 hour. */
export const lockoutMs = (fails: number) => (fails < 5 ? 0 : Math.min(30000 * 2 ** (fails - 5), 3600000));

// UUID v4 ids so records created offline on different devices never collide.
type RandomSource = (n: number) => Uint8Array;
let source: RandomSource | null = null;

/** The app installs expo-crypto's getRandomBytes here; tests use node's crypto. */
export function setRandomSource(fn: RandomSource) { source = fn; }

function bytes(n: number): Uint8Array {
  if (source) return source(n);
  const c: any = (globalThis as any).crypto;
  if (c?.getRandomValues) return c.getRandomValues(new Uint8Array(n));
  throw new Error('No secure random source installed');
}

export function newId(): string {
  const b = bytes(16);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

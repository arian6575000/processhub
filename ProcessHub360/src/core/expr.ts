// Tiny safe arithmetic evaluator for custom pricing formulas (no eval). Supports + - * / ( ), numbers,
// variables and min/max/ceil/floor/round.
const FUNCS: Record<string, (...a: number[]) => number> = {
  min: Math.min, max: Math.max, ceil: Math.ceil, floor: Math.floor, round: Math.round,
};

export function evalExpr(src: string, vars: Record<string, number>): number {
  let i = 0;
  const peek = () => { while (src[i] === ' ') i++; return src[i]; };
  const fail = (m: string): never => { throw new Error(`Formula error: ${m}`); };

  function parseExpr(): number {
    let v = parseTerm();
    for (;;) {
      const c = peek();
      if (c === '+') { i++; v += parseTerm(); } else if (c === '-') { i++; v -= parseTerm(); } else return v;
    }
  }
  function parseTerm(): number {
    let v = parseUnary();
    for (;;) {
      const c = peek();
      if (c === '*') { i++; v *= parseUnary(); }
      else if (c === '/') { i++; const d = parseUnary(); if (d === 0) fail('division by zero'); v /= d; }
      else return v;
    }
  }
  function parseUnary(): number {
    if (peek() === '-') { i++; return -parseUnary(); }
    return parseAtom();
  }
  function parseAtom(): number {
    const c = peek();
    if (c === '(') { i++; const v = parseExpr(); if (peek() !== ')') fail('missing )'); i++; return v; }
    const num = /^\d+(\.\d+)?/.exec(src.slice(i));
    if (num) { i += num[0].length; return parseFloat(num[0]); }
    const id = /^[a-zA-Z_][a-zA-Z0-9_]*/.exec(src.slice(i));
    if (!id) return fail(`unexpected "${c ?? 'end'}"`);
    i += id[0].length;
    if (peek() === '(') {
      const fn = FUNCS[id[0]]; if (!fn) fail(`unknown function ${id[0]}`);
      i++; const args: number[] = [];
      if (peek() !== ')') { for (;;) { args.push(parseExpr()); if (peek() === ',') { i++; continue; } break; } }
      if (peek() !== ')') fail('missing )'); i++;
      return fn(...args);
    }
    if (!(id[0] in vars)) fail(`unknown variable ${id[0]}`);
    return vars[id[0]];
  }

  const out = parseExpr();
  if (peek() !== undefined) fail(`unexpected "${peek()}"`);
  if (!Number.isFinite(out)) fail('result is not a number');
  return out;
}

type Fn = () => unknown | Promise<unknown>;
const tests: { name: string; fn: Fn }[] = []; let prefix = '';
export function describe(n: string, f: () => void) { const p = prefix; prefix += n + ' › '; f(); prefix = p; }
export function it(n: string, f: Fn) { tests.push({ name: prefix + n, fn: f }); }
export const test = it;
export function afterAll(f: Fn) { after.push(f); } const after: Fn[] = [];
export function beforeEach(f: Fn) { be.push(f); } const be: Fn[] = [];
function fmt(v: unknown) { try { return JSON.stringify(v); } catch { return String(v); } }
export function expect(a: any) {
  const m = (neg: boolean) => { const ok = (c: boolean, msg: string) => { if (c === neg) throw new Error((neg ? 'NOT ' : '') + msg); };
    return {
      toBe: (b: any) => ok(Object.is(a, b), `expected ${fmt(a)} toBe ${fmt(b)}`),
      toEqual: (b: any) => ok(fmt(a) === fmt(b), `expected ${fmt(a)} toEqual ${fmt(b)}`),
      toBeGreaterThan: (b: number) => ok(a > b, `${a} > ${b}`), toBeGreaterThanOrEqual: (b: number) => ok(a >= b, `${a} >= ${b}`),
      toBeLessThan: (b: number) => ok(a < b, `${a} < ${b}`), toBeLessThanOrEqual: (b: number) => ok(a <= b, `${a} <= ${b}`),
      toBeTruthy: () => ok(!!a, `${fmt(a)} truthy`), toBeFalsy: () => ok(!a, `${fmt(a)} falsy`),
      toBeNull: () => ok(a === null, `${fmt(a)} null`), toBeUndefined: () => ok(a === undefined, `${fmt(a)} undefined`), toBeDefined: () => ok(a !== undefined, 'defined'),
      toContain: (b: any) => ok(a.includes(b), `${fmt(a)} contains ${fmt(b)}`),
      toMatch: (b: RegExp | string) => ok(typeof b === 'string' ? a.includes(b) : b.test(a), `${a} matches ${b}`),
      toHaveLength: (n: number) => ok(a.length === n, `length ${a.length} == ${n}`),
      toBeCloseTo: (b: number, d = 2) => ok(Math.abs(a - b) < Math.pow(10, -d) / 2, `${a} ≈ ${b}`),
      toThrow: (r?: any) => { let t = false, e: any; try { a(); } catch (x) { t = true; e = x; } ok(t && (!r || String(e?.message).match(r)), 'throws'); },
    }; };
  const r: any = m(false); r.not = m(true);
  r.rejects = { toThrow: async (re?: any) => { let t = false, e: any; try { await a; } catch (x) { t = true; e = x; } if (!t || (re && !String(e?.message).match(re))) throw new Error('expected rejection ' + re); } };
  return r;
}
setTimeout(async () => { let f = 0; for (const t of tests) { try { for (const b of be) await b(); await t.fn(); console.log('✓', t.name); } catch (e) { f++; console.log('✗', t.name, '\n   ', (e as Error).message); } } for (const a of after) await a(); console.log(`\n${tests.length - f}/${tests.length} lulus`); process.exit(f ? 1 : 0); }, 0);

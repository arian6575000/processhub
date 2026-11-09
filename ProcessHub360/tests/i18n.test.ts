import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { en, ur, tr, trMsg, fill, ERR_UR } from '../src/lib/i18n';

const walk = (d: string): string[] => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
const sources = walk('src').filter((f) => /\.tsx?$/.test(f) && !f.endsWith('i18n.ts')).map((f) => fs.readFileSync(f, 'utf8')).join('\n');

test('every English key has an Urdu text (Urdu script, same placeholders)', () => {
  for (const k of Object.keys(en) as (keyof typeof en)[]) {
    assert.ok(ur[k] && ur[k].trim(), `missing Urdu for ${k}`);
    if (k !== 'english' && k !== 'urdu') assert.notEqual(ur[k], en[k], `Urdu text identical to English for ${k}`);
    assert.deepEqual(ur[k].match(/\{\w+\}/g) ?? [], en[k].match(/\{\w+\}/g) ?? [], `placeholders differ for ${k}`);
  }
});
test('Urdu strings contain Urdu letters (except the bilingual brand switch)', () => {
  const arabic = /[\u0600-\u06FF]/;
  for (const k of Object.keys(ur) as (keyof typeof ur)[]) if (k !== 'english') assert.ok(arabic.test(ur[k]), `no Urdu letters in ${k}`);
});
test('tr / fill / trMsg behave', () => {
  assert.equal(tr('en', 'save'), 'Save'); assert.equal(tr('ur', 'save'), ur.save);
  assert.equal(fill('v{v} for {n}', { v: 2, n: 'x' }), 'v2 for x');
  assert.equal(trMsg('en', 'Not enough stock'), 'Not enough stock');
  assert.equal(trMsg('ur', 'Not enough stock'), ERR_UR['Not enough stock']);
  assert.equal(trMsg('ur', 'something unknown'), 'something unknown');
});
test('every translated error message is really thrown somewhere in the source (no stale entries)', () => {
  for (const msg of Object.keys(ERR_UR)) assert.ok(sources.includes(msg), `error text not found in source: ${msg}`);
});
test('Urdu font file is present in the slot the app loads', () => {
  const f = fs.statSync('assets/fonts/UrduNastaliq.ttf'); assert.ok(f.size > 50_000);
});

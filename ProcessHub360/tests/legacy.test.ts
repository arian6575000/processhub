import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPayload, generateKeyPair, signLicense } from '../src/license/licenseCore';
import { verifyAllowingLegacy } from '../src/license/legacy';

const kp = generateKeyPair(), other = generateKeyPair();
const PREFIX = 'ProcessHub';
const DEV = 'ProcessHub-C3F9-D6D0-F504';
const mk = (o: { machine?: string; project?: string | null; key?: string } = {}) => {
  const p: any = buildPayload({ machineId: o.machine ?? DEV, clientName: 'AQ', planName: 'standard', maxUsers: 5, features: { accounting: true }, expiry: { days: 2 }, idFormat: 'any', project: { code: 'processhub360' } });
  if (o.project === null) delete p.project_code; else if (o.project) p.project_code = o.project;
  delete p.license_id; // old Hub payloads have no license_id either
  return signLicense(p, o.key ?? kp.privateKeyHex);
};
const base = { publicKeyHex: kp.publicKeyHex, machineId: DEV, projectCode: 'processhub360' };
const v = (lic: string, allow = true, o: any = {}) => verifyAllowingLegacy(lic, { ...base, ...o }, PREFIX, allow);

test('old Hub license without project_code is accepted when signed, bound to this app Device ID and not expired', () => {
  const r = v(mk({ project: null }));
  assert.ok(r.ok && r.payload.client_name === 'AQ' && r.payload.features['accounting'] === true);
});
test('legacy acceptance can be switched off', () => {
  assert.deepEqual(v(mk({ project: null }), false), { ok: false, reason: 'project' });
});
test('legacy key stays safe: wrong key, other app Device ID, other machine, expired are all rejected', () => {
  assert.deepEqual(v(mk({ project: null, key: other.privateKeyHex })), { ok: false, reason: 'signature' });
  assert.deepEqual(v(mk({ project: null, machine: 'DarziHub-C3F9-D6D0-F504' }), true, { machineId: 'DarziHub-C3F9-D6D0-F504' }), { ok: false, reason: 'project' });
  assert.deepEqual(v(mk({ project: null }), true, { machineId: 'ProcessHub-1111-2222-3333' }), { ok: false, reason: 'machine' });
  assert.deepEqual(v(mk({ project: null }), true, { now: Date.now() + 10 * 86400000 }), { ok: false, reason: 'expired' });
});
test('a license that carries a different project_code is still rejected; the right one still works', () => {
  assert.deepEqual(v(mk({ project: 'darzihub' })), { ok: false, reason: 'project' });
  assert.ok(v(mk({ project: 'processhub360' })).ok);
});

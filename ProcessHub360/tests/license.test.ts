import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPayload, generateKeyPair, signLicense, verifyLicense, PREFIX, formatAppDeviceId } from '../src/license/licenseCore';

const kp = generateKeyPair(), other = generateKeyPair();
const DEV = 'AAAA-BBBB-CCCC-DDDD-EEEE';
const mk = (project = 'processhub360', expiry: any = { days: 30 }, now?: Date, features = {}) =>
  signLicense(buildPayload({ machineId: DEV, clientName: 'Test Mill', planName: 'Pro', maxUsers: 3, features, expiry, idFormat: 'hex20', project: { code: project }, now }), kp.privateKeyHex);
const v = (lic: string, o: any = {}) => verifyLicense(lic, { publicKeyHex: kp.publicKeyHex, machineId: DEV, projectCode: 'processhub360', ...o });

test('valid, lifetime and feature/user limits are carried in the signed payload', () => {
  const r = v(mk('processhub360', { days: 30 }, undefined, { 'inventory.stock': true }));
  assert.ok(r.ok && r.payload.features['inventory.stock'] === true && r.payload.max_users === 3 && r.daysLeft! > 0);
  const l = v(mk('processhub360', 'lifetime')); assert.ok(l.ok && l.daysLeft === null);
  assert.ok(mk().startsWith(PREFIX));
});
test('wrong key, other device, other project, expired, clock rollback, tampering, garbage', () => {
  assert.deepEqual(verifyLicense(mk(), { publicKeyHex: other.publicKeyHex, machineId: DEV, projectCode: 'processhub360' }), { ok: false, reason: 'signature' });
  assert.deepEqual(v(mk(), { machineId: '1111-2222-3333-4444-5555' }), { ok: false, reason: 'machine' });
  assert.deepEqual(v(mk('darzihub')), { ok: false, reason: 'project' });          // DarziHub keys never work here
  assert.deepEqual(v(mk(), { now: Date.now() + 40 * 86400000 }), { ok: false, reason: 'expired' });
  assert.deepEqual(v(mk(), { lastSeen: Date.now() + 3 * 86400000 }), { ok: false, reason: 'clock' });
  const [h, sig] = mk().split('.'); const bad = h.slice(0, -4) + (h.endsWith('AAAA') ? 'BBBB' : 'AAAA') + '.' + sig;
  assert.equal(v(bad).ok, false);
  assert.deepEqual(v('hello'), { ok: false, reason: 'format' });
});
test('a license with no project_code is rejected (stricter than DarziHub)', () => {
  const p: any = buildPayload({ machineId: DEV, clientName: 'X', planName: 'P', maxUsers: 1, features: {}, expiry: { days: 5 }, idFormat: 'hex20', project: { code: 'processhub360' } });
  delete p.project_code;
  assert.deepEqual(v(signLicense(p, kp.privateKeyHex)), { ok: false, reason: 'project' });
});
test('legacy hub prefixes are still accepted when signed by our key and bound to our project', () => {
  const lic = mk(); const body = lic.slice(PREFIX.length);
  assert.ok(v('RETAILX-LIC-' + body).ok);
});

test('app-specific device ids keep licenses of different apps apart', () => {
  const kp = generateKeyPair();
  const HEX = '87A9F285E2DF1234ABCD';
  assert.equal(formatAppDeviceId('ProcessHub', HEX), 'ProcessHub-87A9-F285-E2DF');
  assert.notEqual(formatAppDeviceId('DarziHub', HEX), formatAppDeviceId('ProcessHub', HEX));
  const idA = 'DarziHub-87A9-F285-E2DF', idB = 'ProcessHub-87A9-F285-E2DF';
  const lic = signLicense(buildPayload({ machineId: idA, clientName: 'C', planName: 'Pro', maxUsers: 1, features: {}, expiry: { days: 30 }, idFormat: 'any', project: { code: 'processhub360', legacy: false } }), kp.privateKeyHex);
  assert.equal(verifyLicense(lic, { publicKeyHex: kp.publicKeyHex, machineId: idA, projectCode: 'processhub360' }).ok, true);
  assert.deepEqual(verifyLicense(lic, { publicKeyHex: kp.publicKeyHex, machineId: idB, projectCode: 'processhub360' }), { ok: false, reason: 'machine' });
});

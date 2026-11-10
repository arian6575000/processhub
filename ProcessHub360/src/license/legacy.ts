// Accepts licenses issued by the old RetailX License Hub, which has no project_code in the payload.
// Pure TypeScript (no Expo imports) so it is testable in Node.
//
// A legacy license is accepted only when ALL of this holds (the signature is still the real trust anchor):
//   - Ed25519 signature is valid for this app's public key
//   - machine_id matches this device (and, for legacy keys, starts with this app's DEVICE_PREFIX, so a license
//     made for another app's Device ID can never unlock this app)
//   - not expired, no clock rollback
// A license that DOES carry a project_code must still match this app exactly (DarziHub keys stay rejected).
import { verifyLicense, VerifyResult } from "./licenseCore";

type VerifyOpts = Parameters<typeof verifyLicense>[1];

export function verifyAllowingLegacy(
  license: string,
  opts: VerifyOpts,
  devicePrefix: string,
  allowLegacyNoProjectCode: boolean
): VerifyResult {
  const r = verifyLicense(license, opts);
  if (r.ok || r.reason !== "project" || !allowLegacyNoProjectCode) return r;

  // Re-check without the project binding; everything else (signature, machine, expiry, clock) is still enforced.
  const { projectCode: _ignored, ...rest } = opts;
  const r2 = verifyLicense(license, rest);
  if (!r2.ok) return r2;

  const p = r2.payload;
  if (p.project_code) return { ok: false, reason: "project" }; // belongs to a different project
  const mid = (p.machine_id ?? "").trim().toUpperCase();
  if (!mid.startsWith(devicePrefix.trim().toUpperCase() + "-")) return { ok: false, reason: "project" };
  return r2;
}

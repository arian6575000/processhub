# Phase 1 - DarziHub technical audit

Source: `arian6575000/DarziHub` (folder `DarziHubApp`), read through the GitHub connector and a shallow clone.
Files read in full: package.json, app.json, tsconfig.json, eas.json, AGENTS.md, SECURITY_AND_LICENSE.md, .gitignore, CI workflow,
src/license/*, src/db/schema.ts, src/db/repo.ts, src/app/_layout.tsx, src/ctx/AppContext.tsx, src/lib/backupCrypto.ts, src/lib/lock.ts (head),
tests/license.test.ts, tests/nodeDb.ts, tools/make-project.mjs.
Not read: src/ui/kit.tsx, src/db/backupCore.ts, tab/screens, the other four test files. No DarziHub test was run.
The separately mentioned "license-fix archive" was **not supplied**; findings below describe the current repository files only.

## Architecture
- Expo SDK 58, React Native 0.88, TypeScript `strict`, Expo Router (`src/app`, tabs + stacks), expo-sqlite, expo-secure-store.
- One large `Repo` object over a global `db`; `PRAGMA user_version` migrations (non-destructive). A small `Db` interface lets the same repo run on node:sqlite in tests.
- Pure-TS cores (`licenseCore`, `backupCore`) with no Expo imports: testable in Node.
- State: a single `AppContext` (settings, language, toast, confirm). Module-level mutable formatters.
- Urdu supported (Nastaliq font); RTL handled manually (`forceRTL(false)`).
- CI builds an Android APK on every push; it typechecks but does not run `npm test`; tests are excluded from `tsconfig`.

## Licensing
- Format `MPOS-LIC-<payload>.<ed25519 signature>`, tweetnacl, device-bound, expiry/lifetime, feature map, max users, clock-rollback guard, SecureStore storage.
- Private key never in the app; `.license/` is git-ignored and not committed.
- **Defect:** `project_code` is checked only when the license carries one, although SECURITY_AND_LICENSE.md says licenses without it are rejected.
- **Leak:** `tests/license.test.ts` contains a real signed license (bound to one machine id) in a public repo.
- `LicenseGate.tsx` imports DarziHub's `ctx`, `ui/kit` and theme, so it cannot be copied as-is.

## Gaps relative to ProcessHub 360
| Area | DarziHub | Consequence |
|---|---|---|
| IDs | `INTEGER AUTOINCREMENT` | collide across offline devices -> UUIDs |
| Money / weight | `REAL` | rounding drift -> integer paisa / grams |
| Sync | none (no backend, no version/updated_at/tombstones) | outbox + versioned rows needed |
| Users / RBAC / tenant | PIN lock only | users, roles, activity log, tenant id needed |
| Deletes | hard delete of payments/orders | no audit trail -> soft delete, append-only money |
| Order numbers | `max+1` | conflicts between offline devices -> device-coded tokens |
| Reads | hydrates all items per list | slow at scale |
| Release signing | debug keystore | a real keystore is needed for production |

## Reused / adapted
Db interface + migration pattern, node:sqlite test adapter, licenseCore (project_code now mandatory, English messages), deviceId (new salt),
make-project tool (new project), license test structure (without the leaked key), CI skeleton (tests added), PIN stretching idea.
Everything business-specific (orders, garments, measurements) was left behind.

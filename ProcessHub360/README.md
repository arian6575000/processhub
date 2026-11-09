# ProcessHub 360

Configurable processing, milling and business management app for Pakistani businesses. Expo / React Native, TypeScript (strict), SQLite, offline-first.

Package id: `com.processhub360.app` · database: `processhub360.db` · license project code: `processhub360`.
This is an independent application. DarziHub was used as a read-only reference; nothing here imports DarziHub code at runtime.

## Run

```bash
npm install --legacy-peer-deps
npm run typecheck
npm test                      # 37 tests: core engines + SQLite integration + license
EXPO_PUBLIC_LICENSE_BYPASS=1 npx expo start   # development only (ignored in release builds)
```

## License setup (do this before a real build)

1. `npm run license:project` creates a keypair in `.license/` (git-ignored) and writes the **public** key into `src/license/config.ts`.
2. Back up `.license/processhub360.keys.json` somewhere safe. If it is lost no new licenses can be issued.
3. Register `.license/processhub360.project.json` in your License Hub / Generator (it contains the private key: paste it there, never commit it).
4. The app shows its Device ID on the activation screen; generate a license for that ID with project `processhub360`.

A license must carry `project_code = processhub360` (DarziHub keys are rejected, and so are old-format keys without a project code).
Until a public key is configured the release app stays locked (fails closed).

## Languages and the Urdu font

The whole app is English + Urdu (switch on the first screen or in Settings > Language; Urdu uses right-to-left rows and a Nastaliq font).
Every label lives in `src/lib/i18n.ts`; the Urdu dictionary is typed as complete, so a missing translation fails `npm run typecheck`.

**To use Alvi Nastaleeq, Faisal Nastaliq (or any other Nastaliq font):** copy its `.ttf` over `assets/fonts/UrduNastaliq.ttf` (keep the file name) and rebuild.
No code change is needed. The repo ships Noto Nastaliq Urdu in that slot only as a placeholder, because Alvi/Faisal font files are not on npm or Google Fonts.
Check each font's license before bundling it in a paid app. If a font clips letters, adjust the Urdu `lineHeight` (1.9 x font size) in `src/ui/kit.tsx`.

## Layout

```
src/core      pure TypeScript domain logic (no React/Expo): money, units, processing, workflow, pricing,
              tokens, ownership, payments, inventory, sync, rbac, pin
src/db        schema + migrations, kernel (ids/versioning/outbox), repo modules, sync runner
src/license   Ed25519 license verification, device id, client
src/ui        design system (kit), license gate, auth gate
src/app       Expo Router screens
tests         node:test suites (run with tsx)
docs          AUDIT.md (DarziHub audit), PROGRESS.md (what is done / not done), ARCHITECTURE.md
```

Read `docs/PROGRESS.md` first: it lists exactly which requirements are implemented and which are not.

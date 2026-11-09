# Progress (honest status)

Verified here: `tsc --noEmit` clean, **42 automated tests pass**, `expo export --platform android` produced a Hermes bundle.
**Not verified:** the app has not been run on a device or emulator, no UI/E2E tests exist, iOS is untested, Urdu/RTL layout and the Nastaliq line spacing have not been looked at on a screen. Activity-log action codes and user-entered data (stage names, material names) are shown as typed.

| Phase | Status | Notes |
|---|---|---|
| 1 Audit | Done | docs/AUDIT.md. License-fix archive was not received. |
| 2 Foundation | Done | own identity, bundle id, db namespace, design tokens, UI kit, tabs + stack navigation, complete English + Urdu (every label and known error message, enforced by tests), RTL rows, swappable Nastaliq font slot (`assets/fonts/UrduNastaliq.ttf`; Noto placeholder shipped, Alvi/Faisal files must be supplied). |
| 3 Licensing and auth | Done (core) | Ed25519, device binding, project_code mandatory, clock rollback, gate screen, tests. Users, PIN login/lockout, system roles, activity log. **Missing:** custom-role editor UI (repo method exists), real-device check of device id. |
| 4 Business setup | Partial | Materials (all kinds), units (seeded, not editable), customers with ledger + search. **Suppliers: repo only, no screen.** |
| 5 Processing engine | Partial | Multi-input/output/byproduct/waste/intermediate in core + database, reconciliation, yield, tolerance. **UI: one input material per job; intermediates not entered in UI.** |
| 6 Workflow engine | Done (core + UI) | Unlimited custom stages, order, optional/mandatory, conditional, QC, approval, reject/reopen, history, versioning with snapshots. **Missing:** machine master data and worker assignment screens (ids stored, no UI). |
| 7 Tokens and customer processing | Done | Single and master tokens (device-coded), walk-in orders, partial delivery, partial/pooled payments, idempotent payments, custody ledger, customer ledger. **Receipts are shareable text only: no PDF/print yet.** |
| 8 Inventory and production | Partial | Stock ledger, receive, adjust, wastage, warehouse transfers (repo), weighted-average valuation, reorder alerts, own-business production orders. **Missing:** supplier purchase orders/invoices/returns, warehouse and transfer screens, real batch tracking beyond a batch label. |
| 9 Sales and accounts | Partial | Expenses, daily cash summary and closing, monthly P&L (billing basis), outstanding. **Missing:** retail/wholesale sales, invoices, taxes, returns, bank accounts, supplier ledger, PDF reports. |
| 10 Offline and sync | Partial | Outbox, idempotency, backoff, conflict policies, sync status screen, tested with fake transports. **Missing:** a sync server, pull/apply of remote changes, connectivity monitoring, conflict-resolution UI. Everything stays on the device until a server exists. |
| 11 Testing and release | Partial | Tests above. **Missing:** device testing, UI tests, release keystore, encrypted database, store build. |

Reports: dashboard (real data), cash and monthly P&L screen. Yield/wastage report exists in the repo (`accounts.yieldReport`) but has no screen yet. No PDF export.

## Suggested next steps
1. Run on a phone with `EXPO_PUBLIC_LICENSE_BYPASS=1`, fix what you see.
2. Suppliers + purchases screens (repo has suppliers, stock receive).
3. Reports screens (yield, material-wise, stage-wise) + PDF via expo-print.
4. Sales invoices and returns.
5. Sync server and pull path.

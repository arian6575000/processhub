# ProcessHub 360 - architecture

## Data rules
- Ids are UUID v4 (`core/ids.ts`). Money is integer paisa. Quantities are integer base units (grams / pieces / ml).
- Every synced table carries `tenant_id, created_at, updated_at, version, deleted_at, device_id`. Deletes are soft.
- Payments, deliveries, ledgers are append-only. A payment needs an `idempotency_key`; a retried save returns the original row.
- Workflow versions are insert-only. A job stores a full copy (`jobs.workflow`) plus runtime state/history, so editing a template never changes a running job.
- Pricing policy used for a job is copied into `jobs.pricing_snapshot`, so later price edits do not rewrite old charges.

## Ownership (customer material vs business stock)
Two separate tables: `custody_ledger` (customer property, per job) and `stock_ledger` (business-owned only).
`core/ownership.ts` guards both. Customer jobs never write to `stock_ledger`, except one explicit path:
byproducts a definition says the business keeps (`keep_by_business`) move from custody to stock at final delivery, valued at zero (no revenue is booked).
Own-business jobs consume stock when created (so shortages fail early, atomically) and post finished goods at their consumed cost when ready.

## Accounting treatment (no double counting)
- Processing income = charges of customer-owned jobs. Own-business jobs carry no customer charge.
- Cash view = payments minus refunds, plus expenses. Stage expenses entered on a stage are posted once as an expense row.
- Stock purchases are valued in the stock ledger and are not duplicated as expenses.

## Offline sync
Each write queues a `sync_outbox` row (idempotency key = device:table:id:version). `runSync` pushes batches through a `SyncTransport`;
a row becomes `sent` only when the transport acknowledges its key; failures back off exponentially (2s..5min); server-reported conflicts become `conflict`.
Merge policies live in `core/sync.ts`: append-only (money), last-writer-wins (master data), manual (jobs). No server ships with this repo: see PROGRESS.md.

## Security
PINs: salted, 3000-round SHA-512 stretch; lockout persisted in the database (30s doubling after 5 failures). Roles are permission lists; screens and actions check `can(permission)`.
Note: the database itself is not encrypted at rest.

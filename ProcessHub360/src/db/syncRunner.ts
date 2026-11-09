// Drains the local outbox through a transport. Records are marked 'sent' only after the server acknowledges them.
import type { Db } from './schema';
import { backoffMs, OutboxEntry, SyncTransport } from '../core/sync';

const toEntry = (r: any): OutboxEntry => ({ id: r.id, entity: r.entity, entityId: r.entity_id, op: r.op, payload: r.payload, idempotencyKey: r.idempotency_key, attempts: r.attempts, nextAttemptAt: r.next_attempt_at, status: r.status, lastError: r.last_error, createdAt: r.created_at });

export async function pendingCount(db: Db): Promise<number> {
  return (await db.getFirstAsync<{ n: number }>("SELECT COUNT(*) n FROM sync_outbox WHERE status = 'pending'"))!.n;
}
export async function outboxSummary(db: Db) {
  const rows = await db.getAllAsync<{ status: string; n: number }>('SELECT status, COUNT(*) n FROM sync_outbox GROUP BY status');
  const get = (s: string) => rows.find((r) => r.status === s)?.n ?? 0;
  const failing = (await db.getFirstAsync<{ n: number }>("SELECT COUNT(*) n FROM sync_outbox WHERE status = 'pending' AND attempts > 0"))!.n;
  return { pending: get('pending'), sent: get('sent'), conflict: get('conflict'), failing };
}

export async function runSync(db: Db, transport: SyncTransport, now = Date.now(), batchSize = 50) {
  const rows = await db.getAllAsync<any>("SELECT * FROM sync_outbox WHERE status = 'pending' AND next_attempt_at <= ? ORDER BY created_at, rowid LIMIT ?", [now, batchSize]);
  if (!rows.length) return { sent: 0, failed: 0, conflicts: 0 };
  const batch = rows.map(toEntry);
  let accepted: string[] = [], conflicts: string[] = [];
  try { const r = await transport.push(batch); accepted = r.accepted; conflicts = r.conflicts ?? []; }
  catch (e: any) {
    for (const r of rows) await db.runAsync('UPDATE sync_outbox SET attempts = attempts + 1, next_attempt_at = ?, last_error = ? WHERE id = ?', [now + backoffMs(r.attempts + 1), String(e?.message ?? e), r.id]);
    return { sent: 0, failed: rows.length, conflicts: 0 };
  }
  let sent = 0, failed = 0, conf = 0;
  for (const r of rows) {
    if (conflicts.includes(r.idempotency_key)) { await db.runAsync("UPDATE sync_outbox SET status = 'conflict' WHERE id = ?", [r.id]); conf++; }
    else if (accepted.includes(r.idempotency_key)) { await db.runAsync("UPDATE sync_outbox SET status = 'sent', last_error = NULL WHERE id = ?", [r.id]); sent++; }
    else { await db.runAsync('UPDATE sync_outbox SET attempts = attempts + 1, next_attempt_at = ?, last_error = ? WHERE id = ?', [now + backoffMs(r.attempts + 1), 'Not acknowledged by server', r.id]); failed++; }
  }
  return { sent, failed, conflicts: conf };
}

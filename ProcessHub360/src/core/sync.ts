// Offline-first sync primitives. A local save is NEVER treated as synced until the server acknowledges it.
export type OutboxStatus = 'pending' | 'sent' | 'conflict';
export interface OutboxEntry {
  id: string; entity: string; entityId: string; op: 'upsert' | 'delete'; payload: string;
  idempotencyKey: string; attempts: number; nextAttemptAt: number; status: OutboxStatus; lastError?: string | null; createdAt: number;
}

export const idempotencyKey = (deviceId: string, entity: string, entityId: string, version: number) => `${deviceId}:${entity}:${entityId}:v${version}`;

/** Exponential backoff: 2s, 4s, 8s ... capped at 5 minutes. */
export const backoffMs = (attempts: number) => Math.min(2000 * 2 ** Math.max(0, attempts - 1), 300000);

export type MergePolicy = 'append_only' | 'lww' | 'manual';
export interface VersionInfo { version: number; updatedAt: number }
/**
 * local = our edited copy and the version it was based on; remote = what the server holds now.
 * - append_only (payments, ledgers): never conflicts, duplicates are dropped by id/idempotency key
 * - lww (master data): newest edit wins when both sides changed
 * - manual (jobs, workflow state): both sides changed -> flag a conflict for a person to resolve
 */
export function resolve(local: VersionInfo & { baseVersion: number }, remote: VersionInfo, policy: MergePolicy): 'use_local' | 'use_remote' | 'conflict' {
  if (policy === 'append_only') return 'use_local';
  if (remote.version === local.baseVersion) return 'use_local';        // server has nothing newer
  if (policy === 'lww') return local.updatedAt >= remote.updatedAt ? 'use_local' : 'use_remote';
  return 'conflict';
}

export interface SyncTransport {
  /** Returns the idempotency keys the server accepted (including ones it had already seen). */
  push(batch: OutboxEntry[]): Promise<{ accepted: string[]; conflicts?: string[] }>;
}

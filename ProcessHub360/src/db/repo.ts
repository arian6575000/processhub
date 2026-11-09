import type { Db } from './schema';
import { createKernel, Kernel } from './kernel';
import { masterData } from './masterData';
import { stockModule } from './stock';
import { ordersModule } from './orders';
import { accountsModule } from './accounts';
import { outboxSummary, pendingCount, runSync } from './syncRunner';
import type { SyncTransport } from '../core/sync';

export async function createRepo(db: Db, opts: { now?: () => number } = {}) {
  const k: Kernel = await createKernel(db, opts);
  const md = masterData(k);
  const stock = stockModule(k);
  const orders = ordersModule(k, md, stock);
  const accounts = accountsModule(k, stock);
  return {
    kernel: k, md, stock, orders, accounts,
    settings: { get: () => k.getSettings(), save: (s: Parameters<Kernel['saveSettings']>[0]) => k.saveSettings(s) },
    sync: { pending: () => pendingCount(db), summary: () => outboxSummary(db), run: (t: SyncTransport, now?: number) => runSync(db, t, now) },
  };
}
export type Repo = Awaited<ReturnType<typeof createRepo>>;

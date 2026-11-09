import type * as SQLite from 'expo-sqlite';
import type { Db } from './schema';

export function fromExpo(d: SQLite.SQLiteDatabase): Db {
  return {
    execAsync: (sql) => d.execAsync(sql),
    runAsync: async (sql, params = []) => { const r = await d.runAsync(sql, params); return { lastInsertRowId: r.lastInsertRowId, changes: r.changes }; },
    getAllAsync: (sql, params = []) => d.getAllAsync(sql, params),
    getFirstAsync: (sql, params = []) => d.getFirstAsync(sql, params),
    withTransactionAsync: (task) => d.withTransactionAsync(task),
  };
}

// Opens the app database (own namespace: processhub360.db) and builds the repo once.
import * as SQLite from 'expo-sqlite';
import * as Crypto from 'expo-crypto';
import { fromExpo } from '../db/expoAdapter';
import { createRepo, Repo } from '../db/repo';
import { setRandomSource } from '../core/ids';

let repoPromise: Promise<Repo> | null = null;
export function getRepo(): Promise<Repo> {
  if (!repoPromise) {
    setRandomSource((n) => Crypto.getRandomBytes(n));
    repoPromise = SQLite.openDatabaseAsync('processhub360.db').then((d) => createRepo(fromExpo(d)));
  }
  return repoPromise;
}

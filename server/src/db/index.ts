import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema.js';

export type Db = BetterSQLite3Database<typeof schema>;

const DEFAULT_DB_PATH = './data/zhizhi.db';

export function createDb(dbPath: string): Db {
  if (dbPath !== ':memory:') {
    mkdirSync(dirname(resolve(dbPath)), { recursive: true });
  }
  const sqlite = new Database(dbPath);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  return drizzle(sqlite, { schema });
}

let db: Db | null = null;

export function getDb(): Db {
  if (!db) {
    db = createDb(process.env.DB_PATH ?? DEFAULT_DB_PATH);
  }
  return db;
}

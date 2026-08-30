import { sql } from 'drizzle-orm';
import { CREATE_TABLES, SEED_PLANS } from './ddl.js';
import { createDb } from './index.js';

const dbPath = process.env.DB_PATH ?? './data/zhizhi.db';
const db = createDb(dbPath);

for (const stmt of CREATE_TABLES) {
  db.run(sql.raw(stmt));
}

/** 旧库增量迁移：users 表补充 username / password_hash 列（新库建表已含，幂等跳过） */
function ensureUserColumns() {
  const columns = db.all<{ name: string }>(sql`PRAGMA table_info(users)`).map((c) => c.name);
  if (!columns.includes('username')) {
    db.run(sql.raw('ALTER TABLE users ADD COLUMN username TEXT'));
  }
  if (!columns.includes('password_hash')) {
    db.run(sql.raw('ALTER TABLE users ADD COLUMN password_hash TEXT'));
  }
}
ensureUserColumns();

for (const plan of SEED_PLANS) {
  db.run(
    sql`INSERT OR IGNORE INTO plans (id, name, price_cents, token_quota, model_group)
        VALUES (${plan.id}, ${plan.name}, ${plan.price_cents}, ${plan.token_quota}, ${plan.model_group})`
  );
}

const tableCount = db.get<{ count: number }>(sql`SELECT count(*) AS count FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`);
console.log(`[db:migrate] DB ready at ${dbPath}，${tableCount?.count ?? 0} 张表，plans 种子 ${SEED_PLANS.length} 条`);

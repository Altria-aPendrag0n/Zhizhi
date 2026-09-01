import { sql } from 'drizzle-orm';
import { CREATE_TABLES, SEED_CHANNELS, SEED_PLANS } from './ddl.js';
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

/** 旧库增量迁移：api_keys 表补充子 Key 控制列（key_preview/name/purpose/额度/过期/白名单/限速） */
function ensureApiKeyColumns() {
  const columns = db.all<{ name: string }>(sql`PRAGMA table_info(api_keys)`).map((c) => c.name);
  const additions: Array<[column: string, definition: string]> = [
    ['key_preview', 'TEXT'],
    ['name', 'TEXT'],
    ['purpose', "TEXT NOT NULL DEFAULT 'chat'"],
    ['quota_tokens', 'INTEGER NOT NULL DEFAULT -1'],
    ['used_tokens', 'INTEGER NOT NULL DEFAULT 0'],
    ['expired_at', 'INTEGER'],
    ['allowed_models', 'TEXT'],
    ['rpm_limit', 'INTEGER'],
  ];
  for (const [column, definition] of additions) {
    if (!columns.includes(column)) {
      db.run(sql.raw(`ALTER TABLE api_keys ADD COLUMN ${column} ${definition}`));
    }
  }
}
ensureApiKeyColumns();

/** 旧库增量迁移：usage_logs 表补充渠道/状态/延迟/估算列（索引由 CREATE_TABLES 幂等创建） */
function ensureUsageLogColumns() {
  const columns = db.all<{ name: string }>(sql`PRAGMA table_info(usage_logs)`).map((c) => c.name);
  const additions: Array<[column: string, definition: string]> = [
    ['channel_id', 'TEXT'],
    ['status', "TEXT NOT NULL DEFAULT 'success'"],
    ['latency_ms', 'INTEGER'],
    ['estimated', 'INTEGER NOT NULL DEFAULT 0'],
  ];
  for (const [column, definition] of additions) {
    if (!columns.includes(column)) {
      db.run(sql.raw(`ALTER TABLE usage_logs ADD COLUMN ${column} ${definition}`));
    }
  }
}
ensureUsageLogColumns();

for (const plan of SEED_PLANS) {
  db.run(
    sql`INSERT OR IGNORE INTO plans (id, name, price_cents, token_quota, model_group)
        VALUES (${plan.id}, ${plan.name}, ${plan.price_cents}, ${plan.token_quota}, ${plan.model_group})`
  );
}

for (const channel of SEED_CHANNELS) {
  db.run(
    sql`INSERT OR IGNORE INTO channels (id, name, base_url, api_key_enc, models, group_tag, weight, status, created_at)
        VALUES (${channel.id}, ${channel.name}, ${channel.base_url}, '', ${channel.models}, ${channel.group_tag}, ${channel.weight}, 1, ${Date.now()})`
  );
}

const tableCount = db.get<{ count: number }>(sql`SELECT count(*) AS count FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`);
console.log(`[db:migrate] DB ready at ${dbPath}，${tableCount?.count ?? 0} 张表，plans 种子 ${SEED_PLANS.length} 条，channels 种子 ${SEED_CHANNELS.length} 条（上游 Key 留空，请通过 db:ui 填写）`);

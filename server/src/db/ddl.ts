export const CREATE_TABLES: string[] = [
  `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    identifier TEXT NOT NULL UNIQUE,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    plan_id TEXT,
    plan_expires_at INTEGER,
    quota_tokens INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER,
    updated_at INTEGER
  )`,
  `CREATE TABLE IF NOT EXISTS refresh_tokens (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    device_id TEXT,
    expires_at INTEGER NOT NULL,
    revoked_at INTEGER,
    created_at INTEGER
  )`,
  `CREATE TABLE IF NOT EXISTS api_keys (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    key_hash TEXT NOT NULL UNIQUE,
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER,
    last_used_at INTEGER,
    revoked_at INTEGER
  )`,
  `CREATE TABLE IF NOT EXISTS verify_codes (
    id TEXT PRIMARY KEY,
    identifier TEXT NOT NULL,
    code_hash TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    last_sent_at INTEGER,
    created_at INTEGER
  )`,
  `CREATE TABLE IF NOT EXISTS verify_send_logs (
    id TEXT PRIMARY KEY,
    identifier TEXT NOT NULL,
    created_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS plans (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    price_cents INTEGER NOT NULL,
    token_quota INTEGER NOT NULL,
    model_group TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    order_no TEXT UNIQUE,
    user_id TEXT NOT NULL,
    plan_id TEXT,
    amount_cents INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    provider TEXT,
    paid_at INTEGER,
    created_at INTEGER
  )`,
  `CREATE TABLE IF NOT EXISTS usage_logs (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    api_key_id TEXT,
    model TEXT,
    prompt_tokens INTEGER NOT NULL DEFAULT 0,
    completion_tokens INTEGER NOT NULL DEFAULT 0,
    cost_cents INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER
  )`,
];

export const SEED_PLANS: Array<{
  id: string;
  name: string;
  price_cents: number;
  token_quota: number;
  model_group: string;
}> = [
  { id: 'plan-lite', name: '轻量', price_cents: 990, token_quota: 1_000_000, model_group: 'lite' },
  { id: 'plan-standard', name: '标准', price_cents: 2990, token_quota: 5_000_000, model_group: 'standard' },
  { id: 'plan-pro', name: '专业', price_cents: 5990, token_quota: 20_000_000, model_group: 'pro' },
];

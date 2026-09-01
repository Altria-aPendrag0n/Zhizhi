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
    key_preview TEXT,
    name TEXT,
    purpose TEXT NOT NULL DEFAULT 'chat',
    enabled INTEGER NOT NULL DEFAULT 1,
    quota_tokens INTEGER NOT NULL DEFAULT -1,
    used_tokens INTEGER NOT NULL DEFAULT 0,
    expired_at INTEGER,
    allowed_models TEXT,
    rpm_limit INTEGER,
    created_at INTEGER,
    last_used_at INTEGER,
    revoked_at INTEGER
  )`,
  `CREATE TABLE IF NOT EXISTS channels (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    base_url TEXT NOT NULL,
    api_key_enc TEXT NOT NULL DEFAULT '',
    models TEXT NOT NULL DEFAULT '',
    group_tag TEXT NOT NULL DEFAULT '*',
    weight INTEGER NOT NULL DEFAULT 100,
    status INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER
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
    channel_id TEXT,
    model TEXT,
    prompt_tokens INTEGER NOT NULL DEFAULT 0,
    completion_tokens INTEGER NOT NULL DEFAULT 0,
    cost_cents INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'success',
    latency_ms INTEGER,
    estimated INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER
  )`,
  `CREATE INDEX IF NOT EXISTS idx_usage_key_time ON usage_logs(api_key_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_usage_user_time ON usage_logs(user_id, created_at)`,
];

export const SEED_CHANNELS: Array<{
  id: string;
  name: string;
  base_url: string;
  models: string;
  group_tag: string;
  weight: number;
}> = [
  {
    id: 'channel-zhipu',
    name: '智谱开放平台',
    base_url: 'https://open.bigmodel.cn/api/paas',
    models: 'glm-4.7-flash,glm-4-flash,glm-4v-flash,glm-5',
    group_tag: '*',
    weight: 100,
  },
  {
    id: 'channel-deepseek',
    name: 'DeepSeek 开放平台',
    base_url: 'https://api.deepseek.com',
    models: 'deepseek-v4-flash,deepseek-v4-pro',
    group_tag: '*',
    weight: 100,
  },
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

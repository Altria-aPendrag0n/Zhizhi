import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull().unique(),
  username: text('username').notNull().unique(),
  password_hash: text('password_hash').notNull(),
  plan_id: text('plan_id'),
  plan_expires_at: integer('plan_expires_at'),
  quota_tokens: integer('quota_tokens').notNull().default(0),
  created_at: integer('created_at'),
  updated_at: integer('updated_at'),
});

export const refreshTokens = sqliteTable('refresh_tokens', {
  id: text('id').primaryKey(),
  user_id: text('user_id').notNull(),
  token_hash: text('token_hash').notNull().unique(),
  device_id: text('device_id'),
  expires_at: integer('expires_at').notNull(),
  revoked_at: integer('revoked_at'),
  created_at: integer('created_at'),
});

export const apiKeys = sqliteTable('api_keys', {
  id: text('id').primaryKey(),
  user_id: text('user_id').notNull(),
  key_hash: text('key_hash').notNull().unique(),
  enabled: integer('enabled').notNull().default(1),
  created_at: integer('created_at'),
  last_used_at: integer('last_used_at'),
  revoked_at: integer('revoked_at'),
});

export const verifyCodes = sqliteTable('verify_codes', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  code_hash: text('code_hash').notNull(),
  expires_at: integer('expires_at').notNull(),
  attempts: integer('attempts').notNull().default(0),
  last_sent_at: integer('last_sent_at'),
  created_at: integer('created_at'),
});

export const verifySendLogs = sqliteTable('verify_send_logs', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  created_at: integer('created_at').notNull(),
});

export const plans = sqliteTable('plans', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  price_cents: integer('price_cents').notNull(),
  token_quota: integer('token_quota').notNull(),
  model_group: text('model_group'),
});

export const orders = sqliteTable('orders', {
  id: text('id').primaryKey(),
  order_no: text('order_no').unique(),
  user_id: text('user_id').notNull(),
  plan_id: text('plan_id'),
  amount_cents: integer('amount_cents').notNull(),
  status: text('status').notNull().default('pending'),
  provider: text('provider'),
  paid_at: integer('paid_at'),
  created_at: integer('created_at'),
});

export const usageLogs = sqliteTable('usage_logs', {
  id: text('id').primaryKey(),
  user_id: text('user_id'),
  api_key_id: text('api_key_id'),
  model: text('model'),
  prompt_tokens: integer('prompt_tokens').notNull().default(0),
  completion_tokens: integer('completion_tokens').notNull().default(0),
  cost_cents: integer('cost_cents').notNull().default(0),
  created_at: integer('created_at'),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type RefreshToken = typeof refreshTokens.$inferSelect;
export type ApiKey = typeof apiKeys.$inferSelect;
export type VerifyCode = typeof verifyCodes.$inferSelect;
export type Plan = typeof plans.$inferSelect;

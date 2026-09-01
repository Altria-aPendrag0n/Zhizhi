import type { Context, Next } from 'hono';
import { eq } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { apiKeys, plans, users } from '../db/schema.js';
import { hashKey } from '../services/api-key.js';
import type { AuthVariables } from './auth.js';

export const API_KEY_PREFIX = 'sk-zhizhi-';

export interface GatewayKeyInfo {
  id: string;
  userId: string;
  purpose: string;
  quotaTokens: number;
  usedTokens: number;
  allowedModels: string | null;
  rpmLimit: number | null;
}

export interface GatewayUserInfo {
  id: string;
  quotaTokens: number;
}

export type GatewayVariables = AuthVariables & {
  gatewayKey: GatewayKeyInfo;
  gatewayUser: GatewayUserInfo;
  modelGroup: string;
};

export type GatewayContext = Context<{ Variables: GatewayVariables }>;

/** OpenAI 兼容错误响应体 */
export function openAiError(message: string, type: string, code?: string): { error: { message: string; type: string; code?: string } } {
  return { error: { message, type, ...(code ? { code } : {}) } };
}

export async function requireApiKey(c: GatewayContext, next: Next): Promise<Response> {
  const header = c.req.header('Authorization');
  if (!header?.startsWith('Bearer ')) {
    return c.json(openAiError('Missing API key', 'invalid_request_error'), 401);
  }
  const token = header.slice('Bearer '.length).trim();
  if (!token.startsWith(API_KEY_PREFIX)) {
    return c.json(openAiError('Invalid API key', 'invalid_request_error', 'invalid_api_key'), 401);
  }

  const db = getDb();
  const [key] = await db.select().from(apiKeys).where(eq(apiKeys.key_hash, hashKey(token))).limit(1);
  if (!key || key.revoked_at) {
    return c.json(openAiError('Invalid API key', 'invalid_request_error', 'invalid_api_key'), 401);
  }
  if (!key.enabled) {
    return c.json(openAiError('API key has been disabled', 'invalid_request_error', 'key_disabled'), 403);
  }
  if (key.expired_at !== null && key.expired_at <= Date.now()) {
    return c.json(openAiError('API key has expired', 'invalid_request_error', 'key_expired'), 403);
  }

  const [user] = await db.select().from(users).where(eq(users.id, key.user_id)).limit(1);
  if (!user) {
    return c.json(openAiError('Invalid API key', 'invalid_request_error', 'invalid_api_key'), 401);
  }

  let modelGroup = 'default';
  const planId = user.plan_id;
  if (planId && (user.plan_expires_at === null || user.plan_expires_at > Date.now())) {
    const [plan] = await db.select().from(plans).where(eq(plans.id, planId)).limit(1);
    if (plan?.model_group) {
      modelGroup = plan.model_group;
    }
  }

  c.set('gatewayKey', {
    id: key.id,
    userId: key.user_id,
    purpose: key.purpose,
    quotaTokens: key.quota_tokens,
    usedTokens: key.used_tokens,
    allowedModels: key.allowed_models,
    rpmLimit: key.rpm_limit,
  });
  c.set('gatewayUser', { id: user.id, quotaTokens: user.quota_tokens });
  c.set('modelGroup', modelGroup);
  await next();
  return c.res;
}

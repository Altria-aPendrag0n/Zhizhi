import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { apiKeys, refreshTokens, users } from '../db/schema.js';
import { generateApiKey, hashKey } from './api-key.js';
import { signAccessToken } from './jwt.js';
import { verify as verifyCode } from './verify-code.js';

const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export interface LoginSuccess {
  ok: true;
  access_token: string;
  refresh_token: string;
  user: { id: string; identifier: string; plan_id: string | null; quota_tokens: number };
  api_key?: string;
}

export interface LoginFailure {
  ok: false;
}

export async function login(identifier: string, code: string, deviceId?: string): Promise<LoginSuccess | LoginFailure> {
  if (!(await verifyCode(identifier, code))) {
    return { ok: false };
  }
  const db = getDb();
  const now = Date.now();

  let user = await db.select().from(users).where(eq(users.identifier, identifier)).limit(1).then((r) => r[0]);
  if (!user) {
    const id = randomUUID();
    await db.insert(users).values({ id, identifier, quota_tokens: 0, created_at: now, updated_at: now });
    user = { id, identifier, plan_id: null, plan_expires_at: null, quota_tokens: 0, created_at: now, updated_at: now };
  }

  let apiKey: string | undefined;
  const existingKey = await db.select().from(apiKeys).where(eq(apiKeys.user_id, user.id)).limit(1).then((r) => r[0]);
  if (!existingKey) {
    apiKey = generateApiKey();
    await db.insert(apiKeys).values({
      id: randomUUID(),
      user_id: user.id,
      key_hash: hashKey(apiKey),
      enabled: 1,
      created_at: now,
    });
  }

  const access_token = await signAccessToken(user);
  const refresh_token = randomBytes(32).toString('base64url');
  await db.insert(refreshTokens).values({
    id: randomUUID(),
    user_id: user.id,
    token_hash: hashRefreshToken(refresh_token),
    device_id: deviceId ?? null,
    expires_at: now + REFRESH_TTL_MS,
    created_at: now,
  });

  return {
    ok: true,
    access_token,
    refresh_token,
    user: { id: user.id, identifier: user.identifier, plan_id: user.plan_id, quota_tokens: user.quota_tokens },
    api_key: apiKey,
  };
}

export interface RefreshResult {
  ok: boolean;
  access_token?: string;
  refresh_token?: string;
}

export async function refresh(refreshToken: string): Promise<RefreshResult> {
  const db = getDb();
  const now = Date.now();
  const [record] = await db
    .select()
    .from(refreshTokens)
    .where(eq(refreshTokens.token_hash, hashRefreshToken(refreshToken)))
    .limit(1);
  if (!record || record.revoked_at || record.expires_at <= now) {
    return { ok: false };
  }

  await db.update(refreshTokens).set({ revoked_at: now }).where(eq(refreshTokens.id, record.id));

  const user = await db.select().from(users).where(eq(users.id, record.user_id)).limit(1).then((r) => r[0]);
  if (!user) {
    return { ok: false };
  }

  const newRefreshToken = randomBytes(32).toString('base64url');
  await db.insert(refreshTokens).values({
    id: randomUUID(),
    user_id: user.id,
    token_hash: hashRefreshToken(newRefreshToken),
    device_id: record.device_id,
    expires_at: now + REFRESH_TTL_MS,
    created_at: now,
  });

  return { ok: true, access_token: await signAccessToken(user), refresh_token: newRefreshToken };
}

export async function logout(refreshToken: string): Promise<{ ok: boolean }> {
  const db = getDb();
  await db
    .update(refreshTokens)
    .set({ revoked_at: Date.now() })
    .where(eq(refreshTokens.token_hash, hashRefreshToken(refreshToken)));
  return { ok: true };
}

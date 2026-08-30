import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { apiKeys, refreshTokens, users } from '../db/schema.js';
import { generateApiKey, hashKey } from './api-key.js';
import { signAccessToken } from './jwt.js';
import { verify as verifyCode } from './verify-code.js';
import { hashPassword, verifyPassword } from './password.js';

const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export interface UserSummary {
  id: string;
  identifier: string;
  username: string;
  plan_id: string | null;
  quota_tokens: number;
}

export type AuthResult =
  | { ok: true; access_token: string; refresh_token: string; user: UserSummary; api_key?: string }
  | { ok: false; reason?: string };

function toUserSummary(user: {
  id: string;
  identifier: string;
  username: string | null;
  plan_id: string | null;
  quota_tokens: number;
}): UserSummary {
  return {
    id: user.id,
    identifier: user.identifier,
    username: user.username ?? '',
    plan_id: user.plan_id,
    quota_tokens: user.quota_tokens,
  };
}

async function issueTokens(db: ReturnType<typeof getDb>, user: { id: string; plan_id: string | null }, deviceId?: string, now = Date.now()) {
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
  return { access_token, refresh_token };
}

async function issueApiKeyIfMissing(db: ReturnType<typeof getDb>, userId: string, now = Date.now()): Promise<string | undefined> {
  const existing = await db.select().from(apiKeys).where(eq(apiKeys.user_id, userId)).limit(1).then((r) => r[0]);
  if (existing) return undefined;
  const apiKey = generateApiKey();
  await db.insert(apiKeys).values({
    id: randomUUID(),
    user_id: userId,
    key_hash: hashKey(apiKey),
    enabled: 1,
    created_at: now,
  });
  return apiKey;
}

export interface RegisterInput {
  email: string;
  code: string;
  username: string;
  password: string;
  deviceId?: string;
}

/** 注册：用户名/邮箱占用校验（快速失败）→ 邮箱验证码验证 → 创建账号并签发官方 Key 与令牌 */
export async function register(input: RegisterInput): Promise<AuthResult> {
  const db = getDb();
  const now = Date.now();

  const usernameTaken = await db.select({ id: users.id }).from(users).where(eq(users.username, input.username)).limit(1).then((r) => r[0]);
  if (usernameTaken) {
    return { ok: false, reason: 'username-taken' };
  }
  const emailTaken = await db.select({ id: users.id }).from(users).where(eq(users.identifier, input.email)).limit(1).then((r) => r[0]);
  if (emailTaken) {
    return { ok: false, reason: 'email-taken' };
  }
  if (!(await verifyCode(input.email, input.code))) {
    return { ok: false, reason: 'bad-code' };
  }

  const user = {
    id: randomUUID(),
    identifier: input.email,
    username: input.username,
    password_hash: await hashPassword(input.password),
    plan_id: null,
    plan_expires_at: null,
    quota_tokens: 0,
    created_at: now,
    updated_at: now,
  };
  await db.insert(users).values(user);

  const apiKey = await issueApiKeyIfMissing(db, user.id, now);
  const { access_token, refresh_token } = await issueTokens(db, user, input.deviceId, now);

  return { ok: true, access_token, refresh_token, user: toUserSummary(user), api_key: apiKey };
}

export interface LoginInput {
  username: string;
  password: string;
  deviceId?: string;
}

/** 登录：用户名 + 密码校验通过后签发令牌（官方 Key 仅在注册时下发） */
export async function login(input: LoginInput): Promise<AuthResult> {
  const db = getDb();
  const now = Date.now();

  const user = await db.select().from(users).where(eq(users.username, input.username)).limit(1).then((r) => r[0]);
  if (!user || !(await verifyPassword(input.password, user.password_hash))) {
    return { ok: false };
  }

  const { access_token, refresh_token } = await issueTokens(db, user, input.deviceId, now);
  return { ok: true, access_token, refresh_token, user: toUserSummary(user) };
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

  const { access_token, refresh_token } = await issueTokens(db, user, record.device_id ?? undefined, now);
  return { ok: true, access_token, refresh_token };
}

export async function logout(refreshToken: string): Promise<{ ok: boolean }> {
  const db = getDb();
  await db
    .update(refreshTokens)
    .set({ revoked_at: Date.now() })
    .where(eq(refreshTokens.token_hash, hashRefreshToken(refreshToken)));
  return { ok: true };
}

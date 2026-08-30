import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sql } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { getDb } from '../src/db/index.js';
import { CREATE_TABLES } from '../src/db/ddl.js';
import { apiKeys, users } from '../src/db/schema.js';
import type { Notifier } from '../src/services/notifier.js';

const dir = mkdtempSync(join(tmpdir(), 'zhizhi-auth-'));
process.env.DB_PATH = join(dir, 'test.db');
process.env.JWT_SECRET = 'test-secret';

const db = getDb();
for (const stmt of CREATE_TABLES) {
  db.run(sql.raw(stmt));
}

const sentCodes = new Map<string, string>();
const notifier: Notifier = {
  async send(to, code) {
    sentCodes.set(to, code);
  },
};

const app = createApp({ notifier });

let accessToken = '';
let refreshToken = '';
let apiKeyPlain = '';
let registeredUser: { id: string; identifier: string; username: string } | null = null;

function postJson(path: string, body: unknown, headers: Record<string, string> = {}): Promise<Response> {
  return app.request(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

afterAll(() => {
  (db as unknown as { $client: { close(): void } }).$client.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('POST /api/auth/send-code（仅邮箱）', () => {
  it('delivers a 6-digit code via notifier and returns cooldown_seconds', async () => {
    const res = await postJson('/api/auth/send-code', { identifier: 'user@example.com' });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { success: boolean; cooldown_seconds: number };
    expect(body.success).toBe(true);
    expect(body.cooldown_seconds).toBe(60);
    expect(sentCodes.get('user@example.com')).toMatch(/^\d{6}$/);
  });

  it('rejects resend within the 60s cooldown with 429', async () => {
    const res = await postJson('/api/auth/send-code', { identifier: 'user@example.com' });
    expect(res.status).toBe(429);
  });

  it('rejects an invalid identifier with 400', async () => {
    const res = await postJson('/api/auth/send-code', { identifier: 'not-an-identifier' });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/auth/register', () => {
  it('registers with email + code + username/password and returns tokens + first-time api_key', async () => {
    const code = sentCodes.get('user@example.com')!;
    const res = await postJson('/api/auth/register', {
      email: 'user@example.com',
      code,
      username: 'Alice2026',
      password: 'Passw0rd',
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      access_token: string;
      refresh_token: string;
      api_key?: string;
      user: { id: string; identifier: string; username: string; plan_id: string | null; quota_tokens: number };
    };
    expect(body.access_token).toBeTruthy();
    expect(body.refresh_token).toBeTruthy();
    expect(body.api_key).toMatch(/^sk-zhizhi-/);
    expect(body.user.identifier).toBe('user@example.com');
    expect(body.user.username).toBe('Alice2026');
    expect(body.user.plan_id).toBeNull();
    accessToken = body.access_token;
    refreshToken = body.refresh_token;
    apiKeyPlain = body.api_key!;
    registeredUser = { id: body.user.id, identifier: body.user.identifier, username: body.user.username };
  });

  it('stores only the sha256 hash of the api key in db', async () => {
    const rows = await db.select({ key_hash: apiKeys.key_hash }).from(apiKeys);
    expect(rows).toHaveLength(1);
    expect(rows[0].key_hash).toHaveLength(64);
    expect(rows[0].key_hash).not.toBe(apiKeyPlain);
    expect(rows[0].key_hash).not.toContain('sk-zhizhi-');
  });

  it('stores password as scrypt hash, never plaintext', async () => {
    const row = await db.select({ password_hash: users.password_hash }).from(users).limit(1).then((r) => r[0]);
    expect(row.password_hash).toMatch(/^scrypt:[0-9a-f]{32}:[0-9a-f]{64}$/);
    expect(row.password_hash).not.toContain('Passw0rd');
  });

  it('rejects an already-taken username with 409 (before code check)', async () => {
    const res = await postJson('/api/auth/register', {
      email: 'other@example.com',
      code: '000000',
      username: 'Alice2026',
      password: 'Passw0rd',
    });
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toBe('username already taken');
  });

  it('rejects an already-registered email with 409', async () => {
    const res = await postJson('/api/auth/register', {
      email: 'user@example.com',
      code: '000000',
      username: 'Bob2026',
      password: 'Passw0rd',
    });
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toBe('email already registered');
  });

  it('rejects a wrong code with 401', async () => {
    const res = await postJson('/api/auth/register', {
      email: 'fresh@example.com',
      code: '000000',
      username: 'Fresh2026',
      password: 'Passw0rd',
    });
    expect(res.status).toBe(401);
  });

  it('rejects username/password outside charset or length with 400', async () => {
    const bad = [
      { email: 'a@b.com', code: '000000', username: 'bad name!', password: 'Passw0rd' },
      { email: 'a@b.com', code: '000000', username: 'ok', password: '中文密码' },
      { email: 'a@b.com', code: '000000', username: 'ab', password: 'Passw0rd' },
      { email: 'a@b.com', code: '000000', username: 'Alice2026', password: 'Pass@' },
    ];
    for (const body of bad) {
      const res = await postJson('/api/auth/register', body);
      expect(res.status).toBe(400);
    }
  });
});

describe('POST /api/auth/login（用户名 + 密码）', () => {
  it('logs in with username/password and returns tokens without api_key', async () => {
    const res = await postJson('/api/auth/login', { username: 'Alice2026', password: 'Passw0rd' });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      access_token: string;
      refresh_token: string;
      api_key?: string;
      user: { username: string; identifier: string };
    };
    expect(body.access_token).toBeTruthy();
    expect(body.refresh_token).toBeTruthy();
    expect(body.api_key).toBeUndefined();
    expect(body.user.username).toBe('Alice2026');
    expect(body.user.identifier).toBe('user@example.com');
    accessToken = body.access_token;
    refreshToken = body.refresh_token;
  });

  it('rejects a wrong password with 401', async () => {
    const res = await postJson('/api/auth/login', { username: 'Alice2026', password: 'WrongPass' });
    expect(res.status).toBe(401);
  });

  it('rejects an unknown username with 401', async () => {
    const res = await postJson('/api/auth/login', { username: 'Nobody', password: 'Passw0rd' });
    expect(res.status).toBe(401);
  });
});

describe('POST /api/auth/refresh', () => {
  it('rotates the refresh token and invalidates the old one', async () => {
    const oldToken = refreshToken;
    const res = await postJson('/api/auth/refresh', { refresh_token: oldToken });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { access_token: string; refresh_token: string };
    expect(body.access_token).toBeTruthy();
    expect(body.refresh_token).toBeTruthy();
    expect(body.refresh_token).not.toBe(oldToken);
    refreshToken = body.refresh_token;

    const oldRes = await postJson('/api/auth/refresh', { refresh_token: oldToken });
    expect(oldRes.status).toBe(401);
  });
});

describe('GET /api/me', () => {
  it('returns 401 without a token', async () => {
    const res = await app.request('/api/me');
    expect(res.status).toBe(401);
  });

  it('returns the user profile (including username) with a valid token', async () => {
    const res = await app.request('/api/me', { headers: { Authorization: `Bearer ${accessToken}` } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      identifier: string;
      username: string;
      api_key_created: boolean;
      plan: unknown;
      quota_tokens: number;
    };
    expect(body.identifier).toBe('user@example.com');
    expect(body.username).toBe('Alice2026');
    expect(body.api_key_created).toBe(true);
    expect(body.plan).toBeNull();
    expect(body.quota_tokens).toBe(0);
  });

  it('returns 401 for a forged token', async () => {
    const res = await app.request('/api/me', { headers: { Authorization: 'Bearer forged.token.here' } });
    expect(res.status).toBe(401);
  });
});

describe('POST /api/auth/logout', () => {
  it('revokes the refresh token so refresh returns 401', async () => {
    const res = await postJson('/api/auth/logout', { refresh_token: refreshToken });
    expect(res.status).toBe(200);

    const refreshRes = await postJson('/api/auth/refresh', { refresh_token: refreshToken });
    expect(refreshRes.status).toBe(401);
  });
});

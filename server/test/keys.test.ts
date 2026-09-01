import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { getDb } from '../src/db/index.js';
import { CREATE_TABLES } from '../src/db/ddl.js';
import type { Notifier } from '../src/services/notifier.js';

const dir = mkdtempSync(join(tmpdir(), 'zhizhi-keys-'));
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

async function postJson(path: string, body: unknown, headers: Record<string, string> = {}): Promise<Response> {
  return app.request(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

function authed(token: string): Record<string, string> {
  return { authorization: `Bearer ${token}` };
}

interface KeyRow {
  id: string;
  name: string | null;
  purpose: string;
  key_preview: string | null;
  enabled: number;
  quota_tokens: number;
  used_tokens: number;
  revoked_at: number | null;
}

async function registerUser(email: string, username: string): Promise<{ token: string; apiKey: string }> {
  await postJson('/api/auth/send-code', { identifier: email });
  const code = sentCodes.get(email);
  if (!code) throw new Error('code not captured');
  const res = await postJson('/api/auth/register', { email, code, username, password: 'passw0rd' });
  expect(res.status).toBe(200);
  const body = (await res.json()) as { access_token: string; api_key?: string };
  return { token: body.access_token, apiKey: body.api_key ?? '' };
}

let userA = { token: '', apiKey: '' };
let userB = { token: '', apiKey: '' };

beforeAll(async () => {
  userA = await registerUser('a@example.com', 'usera');
  userB = await registerUser('b@example.com', 'userb');
});

afterAll(() => {
  (db as unknown as { $client: { close(): void } }).$client.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('注册自动签发 chat Key', () => {
  it('issues a chat key at registration with preview stored', async () => {
    expect(userA.apiKey).toMatch(/^sk-zhizhi-/);
    const res = await app.request('/api/keys', { headers: authed(userA.token) });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { keys: KeyRow[] };
    expect(body.keys).toHaveLength(1);
    const key = body.keys[0];
    expect(key.purpose).toBe('chat');
    expect(key.key_preview).toMatch(/^sk-zhizhi-.+…$/);
    expect(key.enabled).toBe(1);
    expect(key.quota_tokens).toBe(-1);
    expect(key.used_tokens).toBe(0);
    expect(JSON.stringify(body)).not.toContain(userA.apiKey);
    expect(JSON.stringify(body)).not.toContain('key_hash');
  });
});

describe('POST /api/keys', () => {
  it('creates a vision key and returns plaintext exactly once', async () => {
    const res = await postJson(
      '/api/keys',
      { name: '图片转笔记', purpose: 'vision' },
      authed(userA.token)
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as { id: string; key: string; purpose: string; key_preview: string };
    expect(body.key).toMatch(/^sk-zhizhi-/);
    expect(body.purpose).toBe('vision');
    expect(body.key_preview).toMatch(/^sk-zhizhi-.+…$/);
  });

  it('rejects unknown purpose and overlong name with 400', async () => {
    const badPurpose = await postJson('/api/keys', { purpose: 'bogus' }, authed(userA.token));
    expect(badPurpose.status).toBe(400);
    const badName = await postJson('/api/keys', { name: 'x'.repeat(65) }, authed(userA.token));
    expect(badName.status).toBe(400);
  });

  it('requires auth', async () => {
    const res = await postJson('/api/keys', {});
    expect(res.status).toBe(401);
  });

  it('enforces the per-user active key limit with 409', async () => {
    let status = 201;
    for (let i = 0; i < 25 && status === 201; i++) {
      status = (await postJson('/api/keys', {}, authed(userB.token))).status;
    }
    expect(status).toBe(409);
  });
});

describe('GET /api/keys 列表', () => {
  it('lists keys newest first without hashes', async () => {
    const res = await app.request('/api/keys', { headers: authed(userA.token) });
    const body = (await res.json()) as { keys: KeyRow[] };
    expect(body.keys).toHaveLength(2);
    expect(body.keys[0].purpose).toBe('vision');
    expect(body.keys[1].purpose).toBe('chat');
    expect(JSON.stringify(body)).not.toContain('key_hash');
  });
});

describe('PATCH /api/keys/:id', () => {
  it('disables and renames a key', async () => {
    const list = (await (await app.request('/api/keys', { headers: authed(userA.token) })).json()) as { keys: KeyRow[] };
    const chatKey = list.keys.find((k) => k.purpose === 'chat');
    if (!chatKey) throw new Error('chat key missing');

    const disabled = await app.request(`/api/keys/${chatKey.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', ...authed(userA.token) },
      body: JSON.stringify({ enabled: false }),
    });
    expect(disabled.status).toBe(200);

    const renamed = await app.request(`/api/keys/${chatKey.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', ...authed(userA.token) },
      body: JSON.stringify({ name: '主力对话' }),
    });
    expect(renamed.status).toBe(200);

    const after = (await (await app.request('/api/keys', { headers: authed(userA.token) })).json()) as { keys: KeyRow[] };
    const row = after.keys.find((k) => k.id === chatKey.id);
    expect(row?.enabled).toBe(0);
    expect(row?.name).toBe('主力对话');
  });

  it('rejects empty patch body with 400', async () => {
    const list = (await (await app.request('/api/keys', { headers: authed(userA.token) })).json()) as { keys: KeyRow[] };
    const res = await app.request(`/api/keys/${list.keys[0].id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', ...authed(userA.token) },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  it('returns 404 for another user’s key', async () => {
    const listA = (await (await app.request('/api/keys', { headers: authed(userA.token) })).json()) as { keys: KeyRow[] };
    const res = await app.request(`/api/keys/${listA.keys[0].id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', ...authed(userB.token) },
      body: JSON.stringify({ enabled: false }),
    });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/keys/:id', () => {
  it('revokes a key, then rejects further patches with 409 and stays idempotent', async () => {
    const list = (await (await app.request('/api/keys', { headers: authed(userA.token) })).json()) as { keys: KeyRow[] };
    const visionKey = list.keys.find((k) => k.purpose === 'vision');
    if (!visionKey) throw new Error('vision key missing');

    const del = await app.request(`/api/keys/${visionKey.id}`, { method: 'DELETE', headers: authed(userA.token) });
    expect(del.status).toBe(200);

    const delAgain = await app.request(`/api/keys/${visionKey.id}`, { method: 'DELETE', headers: authed(userA.token) });
    expect(delAgain.status).toBe(200);

    const patch = await app.request(`/api/keys/${visionKey.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', ...authed(userA.token) },
      body: JSON.stringify({ enabled: true }),
    });
    expect(patch.status).toBe(409);

    const after = (await (await app.request('/api/keys', { headers: authed(userA.token) })).json()) as { keys: KeyRow[] };
    const row = after.keys.find((k) => k.id === visionKey.id);
    expect(row?.revoked_at).toBeGreaterThan(0);
    expect(row?.enabled).toBe(0);
  });

  it('returns 404 for unknown or foreign key', async () => {
    const missing = await app.request('/api/keys/no-such-id', { method: 'DELETE', headers: authed(userA.token) });
    expect(missing.status).toBe(404);
  });
});

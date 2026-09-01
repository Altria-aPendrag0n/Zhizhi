import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer, type AddressInfo } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { CREATE_TABLES } from '../src/db/ddl.js';
import { createDbUiApp } from '../src/db-ui.js';

const dir = mkdtempSync(join(tmpdir(), 'zhizhi-db-ui-admin-'));
delete process.env.CHANNEL_ENC_KEY;

const sqlite = new Database(join(dir, 'test.db'));
sqlite.pragma('journal_mode = WAL');
for (const stmt of CREATE_TABLES) {
  sqlite.exec(stmt);
}

const app = createDbUiApp(sqlite);

async function postJson(path: string, body: unknown): Promise<Response> {
  return app.request(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function patchJson(path: string, body: unknown): Promise<Response> {
  return app.request(path, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const mockUpstream = createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ object: 'list', data: [{ id: 'mock-model' }] }));
});

beforeAll(async () => {
  await new Promise<void>((resolve) => mockUpstream.listen(0, '127.0.0.1', resolve));
});

afterAll(() => {
  mockUpstream.close();
  (mockUpstream as unknown as { closeAllConnections?: () => void }).closeAllConnections?.();
  sqlite.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('POST /api/admin/channels', () => {
  it('creates a channel without upstream key', async () => {
    const res = await postJson('/api/admin/channels', {
      name: '裸渠道',
      base_url: 'https://api.example.com/',
      models: 'm1,m2',
      group_tag: 'pro',
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { channel: { id: string; base_url: string; has_key: boolean; key_masked: string; weight: number; status: number } };
    expect(body.channel.id).toMatch(/^ch-/);
    expect(body.channel.base_url).toBe('https://api.example.com');
    expect(body.channel.has_key).toBe(false);
    expect(body.channel.key_masked).toBe('');
    expect(body.channel.weight).toBe(100);
    expect(body.channel.status).toBe(1);
  });

  it('stores and masks the upstream key (plaintext fallback without CHANNEL_ENC_KEY)', async () => {
    const res = await postJson('/api/admin/channels', {
      name: '带Key渠道',
      base_url: 'https://api.example.com',
      api_key: 'sk-upstream-abcdef123456',
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { channel: { id: string; has_key: boolean; key_is_encrypted: boolean; key_masked: string } };
    expect(body.channel.has_key).toBe(true);
    expect(body.channel.key_is_encrypted).toBe(false);
    expect(body.channel.key_masked).toBe('sk-ups••••3456');
    expect(JSON.stringify(body)).not.toContain('sk-upstream-abcdef123456');
  });

  it('encrypts the upstream key when CHANNEL_ENC_KEY is configured', async () => {
    process.env.CHANNEL_ENC_KEY = 'admin-test-secret';
    try {
      const res = await postJson('/api/admin/channels', {
        name: '加密渠道',
        base_url: 'https://api.example.com',
        api_key: 'sk-upstream-abcdef123456',
      });
      const body = (await res.json()) as { channel: { key_is_encrypted: boolean; key_masked: string } };
      expect(body.channel.key_is_encrypted).toBe(true);
      expect(body.channel.key_masked).toBe('sk-ups••••3456');
    } finally {
      delete process.env.CHANNEL_ENC_KEY;
    }
  });

  it('rejects invalid payloads with 400', async () => {
    expect((await postJson('/api/admin/channels', { base_url: 'https://x.com' })).status).toBe(400);
    expect((await postJson('/api/admin/channels', { name: 'x', base_url: 'ftp://x.com' })).status).toBe(400);
    expect((await postJson('/api/admin/channels', 'not-an-object')).status).toBe(400);
  });
});

describe('GET /api/admin/channels', () => {
  it('lists channels with masked keys only', async () => {
    const res = await app.request('/api/admin/channels');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { channels: Array<{ name: string; api_key_enc?: string }> };
    const names = body.channels.map((ch) => ch.name);
    expect(names).toContain('裸渠道');
    expect(names).toContain('带Key渠道');
    expect(JSON.stringify(body)).not.toContain('api_key_enc');
  });
});

describe('PATCH /api/admin/channels/:id', () => {
  it('updates fields and re-encrypts a new key', async () => {
    const list = (await (await app.request('/api/admin/channels')).json()) as { channels: Array<{ id: string; name: string }> };
    const target = list.channels.find((ch) => ch.name === '裸渠道');
    if (!target) throw new Error('channel missing');

    const res = await patchJson(`/api/admin/channels/${target.id}`, { name: '改名渠道', status: 0, weight: 33, api_key: 'sk-new-key-987654321' });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { channel: { name: string; status: number; weight: number; key_masked: string } };
    expect(body.channel.name).toBe('改名渠道');
    expect(body.channel.status).toBe(0);
    expect(body.channel.weight).toBe(33);
    expect(body.channel.key_masked).toBe('sk-new••••4321');
  });

  it('rejects unknown channel and empty patches', async () => {
    expect((await patchJson('/api/admin/channels/nope', { name: 'x' })).status).toBe(404);
    const list = (await (await app.request('/api/admin/channels')).json()) as { channels: Array<{ id: string }> };
    expect((await patchJson(`/api/admin/channels/${list.channels[0].id}`, {})).status).toBe(400);
  });
});

describe('POST /api/admin/channels/:id/test', () => {
  it('reports ok for a reachable upstream', async () => {
    const port = (mockUpstream.address() as AddressInfo).port;
    const created = await postJson('/api/admin/channels', {
      name: '测试渠道',
      base_url: `http://127.0.0.1:${port}`,
      api_key: 'sk-live-key-123456789',
    });
    const id = ((await created.json()) as { channel: { id: string } }).channel.id;

    const res = await postJson(`/api/admin/channels/${id}/test`, {});
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; status: number; latency_ms: number };
    expect(body.ok).toBe(true);
    expect(body.status).toBe(200);
    expect(body.latency_ms).toBeGreaterThanOrEqual(0);
  });

  it('reports failure for an unreachable upstream', async () => {
    const created = await postJson('/api/admin/channels', {
      name: '死渠道',
      base_url: 'http://127.0.0.1:1',
      api_key: 'sk-dead-key-12345678',
    });
    const id = ((await created.json()) as { channel: { id: string } }).channel.id;

    const res = await postJson(`/api/admin/channels/${id}/test`, {});
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; error?: string };
    expect(body.ok).toBe(false);
    expect(body.error).toBeTruthy();
  });

  it('rejects channels without a key or unknown ids', async () => {
    const created = await postJson('/api/admin/channels', { name: '无Key渠道', base_url: 'https://api.example.com' });
    const bareId = ((await created.json()) as { channel: { id: string } }).channel.id;
    expect((await postJson(`/api/admin/channels/${bareId}/test`, {})).status).toBe(400);
    expect((await postJson('/api/admin/channels/nope/test', {})).status).toBe(404);
  });
});

describe('DELETE /api/admin/channels/:id', () => {
  it('deletes a channel and returns 404 afterwards', async () => {
    const created = await postJson('/api/admin/channels', { name: '待删除', base_url: 'https://api.example.com' });
    const id = ((await created.json()) as { channel: { id: string } }).channel.id;
    expect((await app.request(`/api/admin/channels/${id}`, { method: 'DELETE' })).status).toBe(200);
    expect((await app.request(`/api/admin/channels/${id}`, { method: 'DELETE' })).status).toBe(404);
  });
});

// ===== A2：用户 / 子 Key / 总览 =====

const USER_A = 'user-aaaa';
const USER_B = 'user-bbbb';
const KEY_A = 'key-aaaa';
const KEY_B = 'key-bbbb';

beforeAll(() => {
  const now = Date.now();
  sqlite
    .prepare(
      'INSERT INTO plans (id, name, price_cents, token_quota, model_group) VALUES (?,?,?,?,?)',
    )
    .run('plan-lite', '轻量', 990, 1_000_000, 'lite');
  const insertUser = sqlite.prepare(
    'INSERT INTO users (id, identifier, username, password_hash, plan_id, plan_expires_at, quota_tokens, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)',
  );
  insertUser.run(USER_A, 'a@example.com', 'alice2026', 'hash', 'plan-lite', null, 1_000, now, now);
  insertUser.run(USER_B, 'b@example.com', 'bob2026', 'hash', null, null, 0, now + 1, now + 1);
  const insertKey = sqlite.prepare(
    `INSERT INTO api_keys (id, user_id, key_hash, key_preview, name, purpose, enabled, quota_tokens, used_tokens, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
  );
  insertKey.run(KEY_A, USER_A, 'hash-a', 'sk-zhizhi-AAAA…', '主力对话', 'chat', 1, -1, 150, now);
  insertKey.run(KEY_B, USER_B, 'hash-b', 'sk-zhizhi-BBBB…', '视觉转笔记', 'vision', 1, -1, 0, now + 2);

  const insertLog = sqlite.prepare(
    `INSERT INTO usage_logs (id, user_id, api_key_id, channel_id, model, prompt_tokens, completion_tokens, cost_cents, status, latency_ms, estimated, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
  );
  insertLog.run('log-1', USER_A, KEY_A, 'ch-x', 'glm-5', 100, 200, 50, 'success', 300, 0, now);
  insertLog.run('log-2', USER_A, KEY_A, 'ch-x', 'glm-5', 50, 25, 10, 'aborted', 100, 1, now - 3 * 24 * 60 * 60 * 1000);
  insertLog.run('log-3', USER_A, KEY_A, 'ch-x', 'deepseek-v4-flash', 10, 5, 1, 'success', 80, 0, now);
});

describe('GET /api/admin/users', () => {
  it('lists users with plan, key count and used tokens', async () => {
    const res = await app.request('/api/admin/users');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { users: Array<Record<string, unknown>> };
    const alice = body.users.find((u) => u.username === 'alice2026');
    expect(alice).toBeTruthy();
    expect(alice?.plan_name).toBe('轻量');
    expect(alice?.active_keys).toBe(1);
    expect(alice?.used_tokens).toBe(150);
    expect(alice?.quota_tokens).toBe(1_000);
  });

  it('filters by search', async () => {
    const res = await app.request('/api/admin/users?search=alice');
    const body = (await res.json()) as { users: Array<{ username: string }> };
    expect(body.users.map((u) => u.username)).toEqual(['alice2026']);
  });
});

describe('POST /api/admin/users/:id/quota', () => {
  it('adds quota via delta', async () => {
    const res = await postJson(`/api/admin/users/${USER_B}/quota`, { delta: 5_000 });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { quota_tokens: number }).quota_tokens).toBe(5_000);
  });

  it('sets quota exactly', async () => {
    const res = await postJson(`/api/admin/users/${USER_A}/quota`, { set: 42 });
    const body = (await res.json()) as { quota_tokens: number };
    expect(body.quota_tokens).toBe(42);
  });

  it('rejects invalid payloads and unknown users', async () => {
    expect((await postJson(`/api/admin/users/${USER_A}/quota`, {})).status).toBe(400);
    expect((await postJson(`/api/admin/users/${USER_A}/quota`, { set: -1 })).status).toBe(400);
    expect((await postJson('/api/admin/users/nope/quota', { set: 1 })).status).toBe(404);
  });
});

describe('GET /api/admin/keys', () => {
  it('lists keys joined with user info', async () => {
    const res = await app.request('/api/admin/keys');
    const body = (await res.json()) as { keys: Array<Record<string, unknown>> };
    const keyA = body.keys.find((k) => k.id === KEY_A);
    expect(keyA?.username).toBe('alice2026');
    expect(keyA?.used_tokens).toBe(150);
  });

  it('supports search and status filters', async () => {
    const byUser = (await (await app.request('/api/admin/keys?search=bob')).json()) as { keys: Array<{ id: string }> };
    expect(byUser.keys.map((k) => k.id)).toEqual([KEY_B]);
    const vision = (await (await app.request('/api/admin/keys?status=active')).json()) as { keys: Array<{ id: string }> };
    expect(vision.keys).toHaveLength(2);
  });
});

describe('PATCH & DELETE /api/admin/keys/:id', () => {
  it('updates limits, clears fields with null, and revokes', async () => {
    const res = await patchJson(`/api/admin/keys/${KEY_B}`, {
      quota_tokens: 100_000,
      rpm_limit: 30,
      allowed_models: 'glm-4v-flash',
    });
    expect(res.status).toBe(200);
    let row = sqlite.prepare('SELECT * FROM api_keys WHERE id = ?').get(KEY_B) as Record<string, unknown>;
    expect(row.quota_tokens).toBe(100_000);
    expect(row.rpm_limit).toBe(30);
    expect(row.allowed_models).toBe('glm-4v-flash');

    await patchJson(`/api/admin/keys/${KEY_B}`, { allowed_models: null, rpm_limit: null, enabled: 0 });
    row = sqlite.prepare('SELECT * FROM api_keys WHERE id = ?').get(KEY_B) as Record<string, unknown>;
    expect(row.allowed_models).toBeNull();
    expect(row.rpm_limit).toBeNull();
    expect(row.enabled).toBe(0);

    expect((await app.request(`/api/admin/keys/${KEY_B}`, { method: 'DELETE' })).status).toBe(200);
    row = sqlite.prepare('SELECT * FROM api_keys WHERE id = ?').get(KEY_B) as Record<string, unknown>;
    expect(row.revoked_at).not.toBeNull();
    expect((await app.request('/api/admin/keys/nope', { method: 'DELETE' })).status).toBe(404);
    expect((await patchJson('/api/admin/keys/nope', { enabled: 1 })).status).toBe(404);
    expect((await patchJson(`/api/admin/keys/${KEY_A}`, { enabled: 5 })).status).toBe(400);
  });
});

describe('GET /api/admin/overview', () => {
  it('aggregates cards, today usage, daily trend and top lists', async () => {
    const res = await app.request('/api/admin/overview?days=7');
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      cards: Record<string, number>;
      today: { requests: number; tokens: number; cost_cents: number };
      window: {
        days: number;
        totals: { requests: number; tokens: number; cost_cents: number };
        quality: { estimated: number; aborted: number };
        daily: Array<{ day: string }>;
        top_models: Array<{ model: string; tokens: number }>;
        top_users: Array<{ username: string; tokens: number }>;
      };
    };
    expect(body.cards.users_total).toBe(2);
    expect(body.cards.keys_active).toBe(1);
    expect(body.cards.channels_enabled).toBeGreaterThanOrEqual(1);
    expect(body.cards.quota_sum).toBe(5042);
    expect(body.today.requests).toBe(2);
    expect(body.today.tokens).toBe(315);
    expect(body.window.days).toBe(7);
    expect(body.window.totals.requests).toBe(3);
    expect(body.window.totals.tokens).toBe(390);
    expect(body.window.quality.estimated).toBe(1);
    expect(body.window.quality.aborted).toBe(1);
    expect(body.window.daily.length).toBeGreaterThanOrEqual(2);
    expect(body.window.top_models[0].model).toBe('glm-5');
    expect(body.window.top_models[0].tokens).toBe(375);
    expect(body.window.top_users[0].username).toBe('alice2026');
  });
});

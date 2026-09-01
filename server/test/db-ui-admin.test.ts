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

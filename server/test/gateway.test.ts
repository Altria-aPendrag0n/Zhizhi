import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer, type AddressInfo } from 'node:http';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { getDb } from '../src/db/index.js';
import { CREATE_TABLES } from '../src/db/ddl.js';
import { apiKeys, channels, usageLogs, users } from '../src/db/schema.js';
import { hashKey } from '../src/services/api-key.js';
import type { Notifier } from '../src/services/notifier.js';

const dir = mkdtempSync(join(tmpdir(), 'zhizhi-gateway-'));
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

const captured: Array<Record<string, unknown>> = [];
let mockRequestCount = 0;

const mockUpstream = createServer((req, res) => {
  let data = '';
  req.on('data', (chunk) => {
    data += chunk;
  });
  req.on('end', () => {
    mockRequestCount++;
    const body = JSON.parse(data || '{}') as Record<string, unknown>;
    captured.push(body);
    if (body.model === 'reject-model') {
      res.writeHead(400, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: { message: 'bad param from upstream', type: 'invalid_request_error' } }));
      return;
    }
    if (body.model === 'estimate-model') {
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      res.write('data: {"id":"2","choices":[{"delta":{"content":"abcdefghij"}}]}\n\n');
      res.write('data: [DONE]\n\n');
      res.end();
      return;
    }
    if (body.model === 'hang-model') {
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      res.write('data: {"id":"3","choices":[{"delta":{"content":"abc"}}]}\n\n');
      return;
    }
    if (mockRequestCount === 1) {
      res.writeHead(500, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: { message: 'upstream boom' } }));
      return;
    }
    if (body.stream === true) {
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      res.write('data: {"id":"1","choices":[{"delta":{"content":"hello"}}]}\n\n');
      res.write('data: {"id":"1","choices":[],"usage":{"prompt_tokens":10,"completion_tokens":5,"total_tokens":15}}\n\n');
      res.write('data: [DONE]\n\n');
      res.end();
      return;
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(
      JSON.stringify({
        id: 'chatcmpl-1',
        object: 'chat.completion',
        choices: [{ index: 0, message: { role: 'assistant', content: 'hi' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      })
    );
  });
});

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

async function registerUser(email: string, username: string): Promise<string> {
  await postJson('/api/auth/send-code', { identifier: email });
  const code = sentCodes.get(email);
  if (!code) throw new Error('code not captured');
  const res = await postJson('/api/auth/register', { email, code, username, password: 'passw0rd' });
  expect(res.status).toBe(200);
  return ((await res.json()) as { access_token: string }).access_token;
}

async function createKey(token: string, purpose: 'chat' | 'vision' = 'chat'): Promise<string> {
  const res = await postJson('/api/keys', { purpose }, authed(token));
  expect(res.status).toBe(201);
  return ((await res.json()) as { key: string }).key;
}

async function keyIdOf(plain: string): Promise<string> {
  const [row] = await db.select({ id: apiKeys.id }).from(apiKeys).where(eq(apiKeys.key_hash, hashKey(plain))).limit(1);
  if (!row) throw new Error('key row missing');
  return row.id;
}

async function chat(key: string, body: Record<string, unknown>, headers: Record<string, string> = {}): Promise<Response> {
  return postJson('/v1/chat/completions', { model: 'test-model', messages: [{ role: 'user', content: 'hi' }], ...body }, authed(key));
}

let tokenA = '';
let keyA = '';

beforeAll(async () => {
  await new Promise<void>((resolve) => mockUpstream.listen(0, '127.0.0.1', resolve));
  const port = (mockUpstream.address() as AddressInfo).port;

  tokenA = await registerUser('a@example.com', 'usera');
  keyA = await createKey(tokenA);
  await db.update(users).set({ quota_tokens: 1_000_000 }).where(eq(users.username, 'usera'));

  await db.insert(channels).values({
    id: 'test-ok',
    name: 'mock-ok',
    base_url: `http://127.0.0.1:${port}`,
    api_key_enc: 'sk-upstream-ok',
    models: 'test-model,reject-model,estimate-model,hang-model',
    group_tag: '*',
    weight: 100,
    status: 1,
    created_at: Date.now(),
  });
  await db.insert(channels).values({
    id: 'test-ok2',
    name: 'mock-ok-2',
    base_url: `http://127.0.0.1:${port}`,
    api_key_enc: 'sk-upstream-ok-2',
    models: 'test-model,reject-model,estimate-model,hang-model',
    group_tag: '*',
    weight: 100,
    status: 1,
    created_at: Date.now(),
  });
  await db.insert(channels).values({
    id: 'test-dead',
    name: 'mock-dead',
    base_url: 'http://127.0.0.1:1',
    api_key_enc: 'sk-upstream-dead',
    models: 'dead-model',
    group_tag: '*',
    weight: 100,
    status: 1,
    created_at: Date.now(),
  });
});

afterAll(() => {
  mockUpstream.close();
  (mockUpstream as unknown as { closeAllConnections?: () => void }).closeAllConnections?.();
  (db as unknown as { $client: { close(): void } }).$client.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('鉴权与控制链', () => {
  it('rejects missing or invalid keys with 401', async () => {
    expect((await postJson('/v1/chat/completions', { model: 'test-model', messages: [] })).status).toBe(401);
    expect((await chat('sk-zhizhi-not-a-real-key', {})).status).toBe(401);
  });

  it('rejects revoked keys with 401', async () => {
    const plain = await createKey(tokenA);
    const id = await keyIdOf(plain);
    await app.request(`/api/keys/${id}`, { method: 'DELETE', headers: authed(tokenA) });
    expect((await chat(plain, {})).status).toBe(401);
  });

  it('rejects disabled keys with 403', async () => {
    const plain = await createKey(tokenA);
    const id = await keyIdOf(plain);
    await db.update(apiKeys).set({ enabled: 0 }).where(eq(apiKeys.id, id));
    const res = await chat(plain, {});
    expect(res.status).toBe(403);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('key_disabled');
  });

  it('rejects expired keys with 403', async () => {
    const plain = await createKey(tokenA);
    const id = await keyIdOf(plain);
    await db.update(apiKeys).set({ expired_at: Date.now() - 1000 }).where(eq(apiKeys.id, id));
    const res = await chat(plain, {});
    expect(res.status).toBe(403);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('key_expired');
    await db.update(apiKeys).set({ expired_at: null }).where(eq(apiKeys.id, id));
  });

  it('rejects models outside key whitelist with 403', async () => {
    const plain = await createKey(tokenA);
    const id = await keyIdOf(plain);
    await db.update(apiKeys).set({ allowed_models: 'other-model' }).where(eq(apiKeys.id, id));
    const res = await chat(plain, {});
    expect(res.status).toBe(403);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('model_not_allowed');
    await db.update(apiKeys).set({ allowed_models: null }).where(eq(apiKeys.id, id));
  });

  it('rejects when user quota is exhausted with 402', async () => {
    const tokenC = await registerUser('c@example.com', 'userc');
    const keyC = await createKey(tokenC);
    const res = await chat(keyC, {});
    expect(res.status).toBe(402);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('quota_exhausted');
  });

  it('rejects per-key rpm limit with 429', async () => {
    const plain = await createKey(tokenA);
    const id = await keyIdOf(plain);
    await db.update(apiKeys).set({ rpm_limit: 1 }).where(eq(apiKeys.id, id));
    expect((await chat(plain, { model: 'dead-model' })).status).toBe(502);
    expect((await chat(plain, { model: 'dead-model' })).status).toBe(429);
    await db.update(apiKeys).set({ rpm_limit: null }).where(eq(apiKeys.id, id));
  });

  it('rejects models without any serving channel with 403', async () => {
    const res = await chat(keyA, { model: 'no-such-model' });
    expect(res.status).toBe(403);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('model_not_available');
  });

  it('rejects invalid bodies with 400 and oversized bodies with 413', async () => {
    expect((await chat(keyA, { model: undefined })).status).toBe(400);
    process.env.GATEWAY_MAX_BODY_BYTES = '100';
    try {
      const res = await chat(keyA, { messages: [{ role: 'user', content: 'x'.repeat(1024) }] });
      expect(res.status).toBe(413);
    } finally {
      delete process.env.GATEWAY_MAX_BODY_BYTES;
    }
  });
});

describe('转发与故障转移', () => {
  it('fails over from a 500 channel to a healthy one and clamps max_tokens (non-stream)', async () => {
    const res = await chat(keyA, { stream: false, max_tokens: 999_999 });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string; usage: { total_tokens: number } };
    expect(body.id).toBe('chatcmpl-1');
    expect(body.usage.total_tokens).toBe(15);
    const last = captured[captured.length - 1];
    expect(last.max_tokens).toBe(32768);
    expect(last.stream_options).toBeUndefined();
  });

  it('passes through SSE stream and injects stream_options', async () => {
    const res = await chat(keyA, { stream: true });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    const text = await res.text();
    expect(text).toContain('data: {"id":"1","choices":[{"delta":{"content":"hello"}}]}');
    expect(text).toContain('"usage"');
    expect(text).toContain('[DONE]');
    const last = captured[captured.length - 1];
    expect(last.stream_options).toEqual({ include_usage: true });
  });

  it('passes non-retryable upstream 400 through with generic message', async () => {
    const res = await chat(keyA, { model: 'reject-model' });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { type: string; message: string } };
    expect(body.error.type).toBe('upstream_error');
    expect(body.error.message).not.toContain('bad param');
  });

  it('returns 502 when all channels fail (network error)', async () => {
    const res = await chat(keyA, { model: 'dead-model' });
    expect(res.status).toBe(502);
  });

  it('lists models from channels matching the group', async () => {
    const res = await app.request('/v1/models', { headers: authed(keyA) });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: Array<{ id: string }> };
    const ids = body.data.map((m) => m.id);
    expect(ids).toContain('test-model');
    expect(ids).toContain('dead-model');
  });
});

describe('计量与扣费', () => {
  async function latestUsageLog(apiKeyId: string) {
    const rows = await db
      .select()
      .from(usageLogs)
      .where(eq(usageLogs.api_key_id, apiKeyId))
      .orderBy(sql`created_at DESC`)
      .limit(1);
    return rows[0];
  }

  it('records exact usage from upstream and deducts user quota (non-stream)', async () => {
    const apiKeyId = await keyIdOf(keyA);
    const before = ((await (await app.request('/api/me', { headers: authed(tokenA) })).json()) as { quota_tokens: number }).quota_tokens;

    const res = await chat(keyA, { stream: false });
    expect(res.status).toBe(200);

    const after = ((await (await app.request('/api/me', { headers: authed(tokenA) })).json()) as { quota_tokens: number }).quota_tokens;
    expect(before - after).toBe(15);

    const log = await latestUsageLog(apiKeyId);
    expect(log).toBeTruthy();
    expect(log?.prompt_tokens).toBe(10);
    expect(log?.completion_tokens).toBe(5);
    expect(log?.estimated).toBe(0);
    expect(log?.status).toBe('success');
    expect(log?.channel_id).toMatch(/^test-ok2?$/);
    expect(log?.cost_cents).toBe(0);
    expect(log?.latency_ms).toBeGreaterThanOrEqual(0);

    const [keyRow] = await db.select().from(apiKeys).where(eq(apiKeys.id, apiKeyId));
    expect(keyRow.used_tokens).toBeGreaterThanOrEqual(15);
    expect(keyRow.last_used_at).toBeGreaterThan(0);
  });

  it('records exact usage from the final SSE usage chunk (stream)', async () => {
    const apiKeyId = await keyIdOf(keyA);
    const res = await chat(keyA, { stream: true });
    expect(res.status).toBe(200);
    await res.text();

    const log = await latestUsageLog(apiKeyId);
    expect(log?.prompt_tokens).toBe(10);
    expect(log?.completion_tokens).toBe(5);
    expect(log?.estimated).toBe(0);
    expect(log?.status).toBe('success');
  });

  it('falls back to char estimation and marks estimated when upstream omits usage', async () => {
    const apiKeyId = await keyIdOf(keyA);
    const messages = [{ role: 'user', content: 'hi' }];
    const expectedPrompt = Math.ceil(JSON.stringify(messages).length / 1.6);
    const res = await postJson('/v1/chat/completions', { model: 'estimate-model', messages, stream: true }, authed(keyA));
    expect(res.status).toBe(200);
    await res.text();

    const log = await latestUsageLog(apiKeyId);
    expect(log?.estimated).toBe(1);
    expect(log?.prompt_tokens).toBe(expectedPrompt);
    expect(log?.completion_tokens).toBe(Math.ceil(10 / 1.6));
    expect(log?.status).toBe('success');
  });

  it('records aborted streams with estimation when the client disconnects', async () => {
    const apiKeyId = await keyIdOf(keyA);
    const res = await chat(keyA, { model: 'hang-model', stream: true });
    expect(res.status).toBe(200);
    const reader = res.body!.getReader();
    await reader.read();
    await reader.cancel();

    const log = await latestUsageLog(apiKeyId);
    expect(log?.status).toBe('aborted');
    expect(log?.estimated).toBe(1);
    expect(log?.completion_tokens).toBe(Math.ceil(3 / 1.6));
    expect(log?.prompt_tokens).toBeGreaterThan(0);
  });

  it('blocks further requests once a per-key quota is exhausted', async () => {
    const plain = await createKey(tokenA);
    const id = await keyIdOf(plain);
    await db.update(apiKeys).set({ quota_tokens: 10 }).where(eq(apiKeys.id, id));
    const first = await chat(plain, { stream: false });
    expect(first.status).toBe(200);
    const second = await chat(plain, { stream: false });
    expect(second.status).toBe(402);
    expect(((await second.json()) as { error: { code: string } }).error.code).toBe('quota_exhausted');
  });
});

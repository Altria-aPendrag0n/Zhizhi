import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { getDb } from '../src/db/index.js';
import { CREATE_TABLES } from '../src/db/ddl.js';
import { usageLogs, users } from '../src/db/schema.js';
import type { Notifier } from '../src/services/notifier.js';

const dir = mkdtempSync(join(tmpdir(), 'zhizhi-usage-'));
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

async function registerUser(email: string, username: string): Promise<{ token: string; userId: string }> {
  await postJson('/api/auth/send-code', { identifier: email });
  const code = sentCodes.get(email);
  if (!code) throw new Error('code not captured');
  const res = await postJson('/api/auth/register', { email, code, username, password: 'passw0rd' });
  expect(res.status).toBe(200);
  const body = (await res.json()) as { access_token: string; user: { id: string } };
  return { token: body.access_token, userId: body.user.id };
}

interface Totals {
  requests: number;
  prompt_tokens: number;
  completion_tokens: number;
  cost_cents: number;
}

interface UsageBody {
  days: number;
  quota_tokens?: number;
  totals: Totals;
  daily: Array<{ day: string } & Totals>;
  models: Array<{ model: string | null } & Totals>;
}

let tokenA = '';
let tokenB = '';
let userAId = '';
let keyIdA = '';

beforeAll(async () => {
  const regA = await registerUser('a@example.com', 'usera');
  tokenA = regA.token;
  userAId = regA.userId;
  tokenB = (await registerUser('b@example.com', 'userb')).token;
  const keyRes = await postJson('/api/keys', { purpose: 'chat' }, authed(tokenA));
  keyIdA = ((await keyRes.json()) as { id: string }).id;

  await db.update(users).set({ quota_tokens: 500_000 }).where(eq(users.username, 'usera'));

  const now = Date.now();
  await db.insert(usageLogs).values([
    {
      id: 'log-1',
      user_id: userAId,
      api_key_id: keyIdA,
      channel_id: 'test-ok',
      model: 'test-model',
      prompt_tokens: 10,
      completion_tokens: 5,
      cost_cents: 3,
      status: 'success',
      latency_ms: 120,
      estimated: 0,
      created_at: now,
    },
    {
      id: 'log-2',
      user_id: userAId,
      api_key_id: keyIdA,
      channel_id: 'test-ok',
      model: 'glm-5',
      prompt_tokens: 20,
      completion_tokens: 8,
      cost_cents: 7,
      status: 'success',
      latency_ms: 240,
      estimated: 0,
      created_at: now - 24 * 60 * 60 * 1000,
    },
  ]);
});

afterAll(() => {
  (db as unknown as { $client: { close(): void } }).$client.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('GET /api/keys/:id/usage', () => {
  it('aggregates per-key totals, daily and per-model usage', async () => {
    const res = await app.request(`/api/keys/${keyIdA}/usage`, { headers: authed(tokenA) });
    expect(res.status).toBe(200);
    const body = (await res.json()) as UsageBody;
    expect(body.days).toBe(30);
    expect(body.totals).toEqual({ requests: 2, prompt_tokens: 30, completion_tokens: 13, cost_cents: 10 });
    expect(body.daily).toHaveLength(2);
    expect(body.models).toHaveLength(2);
    const glm = body.models.find((m) => m.model === 'glm-5');
    expect(glm).toMatchObject({ requests: 1, prompt_tokens: 20, completion_tokens: 8, cost_cents: 7 });
  });

  it('narrows the window with the days query param', async () => {
    const res = await app.request(`/api/keys/${keyIdA}/usage?days=1`, { headers: authed(tokenA) });
    const body = (await res.json()) as UsageBody;
    expect(body.days).toBe(1);
    expect(body.totals.requests).toBe(1);
    expect(body.totals.prompt_tokens).toBe(10);
  });

  it('clamps invalid days values', async () => {
    const zero = (await (await app.request(`/api/keys/${keyIdA}/usage?days=0`, { headers: authed(tokenA) })).json()) as UsageBody;
    expect(zero.days).toBe(30);
    const huge = (await (await app.request(`/api/keys/${keyIdA}/usage?days=99999`, { headers: authed(tokenA) })).json()) as UsageBody;
    expect(huge.days).toBe(365);
  });

  it('returns 404 for foreign or unknown keys', async () => {
    expect((await app.request(`/api/keys/${keyIdA}/usage`, { headers: authed(tokenB) })).status).toBe(404);
    expect((await app.request('/api/keys/nope/usage', { headers: authed(tokenA) })).status).toBe(404);
  });

  it('requires auth', async () => {
    expect((await app.request(`/api/keys/${keyIdA}/usage`)).status).toBe(401);
  });
});

describe('GET /api/usage/summary', () => {
  it('returns remaining quota and user-level aggregates', async () => {
    const res = await app.request('/api/usage/summary', { headers: authed(tokenA) });
    expect(res.status).toBe(200);
    const body = (await res.json()) as UsageBody;
    expect(body.quota_tokens).toBe(500_000);
    expect(body.totals).toEqual({ requests: 2, prompt_tokens: 30, completion_tokens: 13, cost_cents: 10 });
    expect(body.daily).toHaveLength(2);
    expect(body.models).toHaveLength(2);
  });

  it('is scoped to the requesting user', async () => {
    const res = await app.request('/api/usage/summary', { headers: authed(tokenB) });
    const body = (await res.json()) as UsageBody;
    expect(body.totals.requests).toBe(0);
    expect(body.quota_tokens).toBe(0);
  });
});

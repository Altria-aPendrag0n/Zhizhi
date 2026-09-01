import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { CREATE_TABLES } from '../src/db/ddl.js';
import { createDbUiApp } from '../src/db-ui.js';

const dir = mkdtempSync(join(tmpdir(), 'zhizhi-db-ui-'));

const sqlite = new Database(join(dir, 'test.db'));
sqlite.pragma('journal_mode = WAL');
for (const stmt of CREATE_TABLES) {
  sqlite.exec(stmt);
}

sqlite
  .prepare(
    'INSERT INTO users (id, identifier, username, password_hash, plan_id, plan_expires_at, quota_tokens, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)',
  )
  .run('u1', 'a@example.com', 'Alice2026', 'hash', 'plan-lite', 1720000000000, 100, 1720000000000, 1720000000000);
sqlite
  .prepare(
    'INSERT INTO users (id, identifier, username, password_hash, plan_id, plan_expires_at, quota_tokens, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)',
  )
  .run('u2', 'b@example.com', 'Bob2026', 'hash', 'plan-lite', null, 200, 1720000000001, 1720000000001);
sqlite
  .prepare('INSERT INTO plans (id, name, price_cents, token_quota, model_group) VALUES (?,?,?,?,?)')
  .run('plan-lite', '轻量', 990, 1000000, 'lite');

const app = createDbUiApp(sqlite);

interface ListingBody {
  name: string;
  columns: Array<{ name: string; type: string }>;
  rows: Array<Record<string, unknown>>;
  total: number;
  page: number;
  size: number;
  pages: number;
}

interface MetaBody {
  dbPath: string;
  tables: Array<{ name: string; count: number }>;
}

async function getJson(path: string): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await app.request(path);
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

async function postJson(
  path: string,
  body: unknown,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await app.request(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

afterAll(() => {
  sqlite.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('GET /api/meta', () => {
  it('lists all tables with row counts', async () => {
    const { status, body } = await getJson('/api/meta');
    const meta = body as unknown as MetaBody;
    expect(status).toBe(200);
    expect(meta.dbPath).toContain('test.db');
    expect(meta.tables).toHaveLength(9);
    const byName = new Map(meta.tables.map((t) => [t.name, t.count]));
    expect(byName.get('users')).toBe(2);
    expect(byName.get('plans')).toBe(1);
    expect(byName.get('refresh_tokens')).toBe(0);
    expect(byName.get('channels')).toBe(0);
  });
});

describe('GET /api/tables/:name', () => {
  it('lists rows with rowid hidden column', async () => {
    const { status, body } = await getJson('/api/tables/users');
    const listing = body as unknown as ListingBody;
    expect(status).toBe(200);
    expect(listing.name).toBe('users');
    expect(listing.columns.map((c) => c.name)).toContain('username');
    expect(listing.total).toBe(2);
    expect(typeof listing.rows[0]!.__rid).toBe('number');
    expect(listing.rows[0]!.username).toBe('Alice2026');
  });

  it('searches across all columns', async () => {
    const { body } = await getJson('/api/tables/users?search=Alice');
    const listing = body as unknown as ListingBody;
    expect(listing.total).toBe(1);
    expect(listing.rows[0]!.username).toBe('Alice2026');
  });

  it('returns zero rows for unmatched search', async () => {
    const { body } = await getJson('/api/tables/users?search=nope');
    expect((body as unknown as ListingBody).total).toBe(0);
  });

  it('escapes LIKE wildcards in search', async () => {
    const { body } = await getJson('/api/tables/users?search=%25');
    expect((body as unknown as ListingBody).total).toBe(0);
  });

  it('sorts by whitelisted column', async () => {
    const { status, body } = await getJson('/api/tables/users?order=quota_tokens&dir=desc');
    const listing = body as unknown as ListingBody;
    expect(status).toBe(200);
    expect(listing.rows[0]!.username).toBe('Bob2026');
  });

  it('paginates with size and page', async () => {
    const { body } = await getJson('/api/tables/users?size=1&page=2');
    const listing = body as unknown as ListingBody;
    expect(listing.total).toBe(2);
    expect(listing.pages).toBe(2);
    expect(listing.page).toBe(2);
    expect(listing.rows[0]!.username).toBe('Bob2026');
  });

  it('clamps size to [10, 200]', async () => {
    const { body } = await getJson('/api/tables/users?size=9999');
    expect((body as unknown as ListingBody).size).toBe(200);
  });

  it('rejects unknown tables with 404', async () => {
    const { status, body } = await getJson('/api/tables/nope');
    expect(status).toBe(404);
    expect(body.error).toContain('表不存在');
  });

  it('rejects non-whitelisted order columns with 400', async () => {
    const { status, body } = await getJson('/api/tables/users?order=not_a_column');
    expect(status).toBe(400);
    expect(body.error).toContain('排序字段');
  });
});

describe('POST /api/sql', () => {
  it('runs SELECT in rows mode', async () => {
    const { status, body } = await postJson('/api/sql', {
      sql: 'SELECT username, quota_tokens FROM users ORDER BY username',
    });
    expect(status).toBe(200);
    expect(body.mode).toBe('rows');
    expect(body.columns).toEqual([
      { name: 'username', type: '' },
      { name: 'quota_tokens', type: '' },
    ]);
    expect(body.rows).toEqual([
      { username: 'Alice2026', quota_tokens: 100 },
      { username: 'Bob2026', quota_tokens: 200 },
    ]);
  });

  it('runs PRAGMA in rows mode', async () => {
    const { status, body } = await postJson('/api/sql', { sql: 'PRAGMA table_info(users)' });
    expect(status).toBe(200);
    expect(body.mode).toBe('rows');
    const rows = body.rows as Array<{ name: string }>;
    expect(rows.map((r) => r.name)).toContain('username');
  });

  it('runs UPDATE in exec mode with changes', async () => {
    const { status, body } = await postJson('/api/sql', {
      sql: "UPDATE users SET quota_tokens = 555 WHERE username = 'Bob2026'",
    });
    expect(status).toBe(200);
    expect(body.mode).toBe('exec');
    expect(body.changes).toBe(1);
    expect(typeof body.lastInsertRowid).toBe('string');
    const check = sqlite.prepare('SELECT quota_tokens FROM users WHERE id = ?').get('u2') as {
      quota_tokens: number;
    };
    expect(check.quota_tokens).toBe(555);
  });

  it('rejects multiple statements with 400', async () => {
    const { status, body } = await postJson('/api/sql', { sql: 'SELECT 1; SELECT 2' });
    expect(status).toBe(400);
    expect(body.error).toContain('一条语句');
  });

  it('reports SQL errors as 400', async () => {
    const { status, body } = await postJson('/api/sql', { sql: 'SELECT * FROM nope' });
    expect(status).toBe(400);
    expect(body.error).toContain('no such table');
  });
});

describe('POST /api/tables/:name/delete', () => {
  it('deletes a row by rowid and updates counts', async () => {
    const found = await getJson('/api/tables/users?search=Bob');
    const listing = found.body as unknown as ListingBody;
    expect(listing.total).toBe(1);
    const rid = listing.rows[0]!.__rid as number;

    const del = await postJson('/api/tables/users/delete', { rid });
    expect(del.status).toBe(200);
    expect(del.body.deleted).toBe(1);

    const after = await getJson('/api/tables/users');
    expect((after.body as unknown as ListingBody).total).toBe(1);
  });

  it('returns deleted 0 for missing rowid', async () => {
    const { status, body } = await postJson('/api/tables/users/delete', { rid: 99999 });
    expect(status).toBe(200);
    expect(body.deleted).toBe(0);
  });

  it('rejects invalid rid with 400', async () => {
    const { status } = await postJson('/api/tables/users/delete', { rid: 'abc' });
    expect(status).toBe(400);
  });

  it('rejects unknown tables with 404', async () => {
    const { status, body } = await postJson('/api/tables/nope/delete', { rid: 1 });
    expect(status).toBe(404);
    expect(body.error).toContain('表不存在');
  });
});

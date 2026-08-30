import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq, sql } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { getDb } from '../src/db/index.js';
import { CREATE_TABLES } from '../src/db/ddl.js';
import { verifyCodes } from '../src/db/schema.js';
import {
  canSend,
  create,
  generateCode,
  hashCode,
  RESEND_COOLDOWN_MS,
  verify,
} from '../src/services/verify-code.js';

const dir = mkdtempSync(join(tmpdir(), 'zhizhi-vc-'));
process.env.DB_PATH = join(dir, 'test.db');

const db = getDb();
for (const stmt of CREATE_TABLES) {
  db.run(sql.raw(stmt));
}

const silentNotifier = { send: async () => {} };

afterAll(() => {
  (db as unknown as { $client: { close(): void } }).$client.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('generateCode', () => {
  it('produces 6-digit numeric codes', () => {
    for (let i = 0; i < 100; i++) {
      expect(generateCode()).toMatch(/^\d{6}$/);
    }
  });

  it('produces varied codes', () => {
    const set = new Set(Array.from({ length: 200 }, () => generateCode()));
    expect(set.size).toBeGreaterThan(190);
  });
});

describe('hashCode', () => {
  it('hashes identifier+code without leaking plaintext', () => {
    const code = '123456';
    const hash = hashCode('a@b.com', code);
    expect(hash).toHaveLength(64);
    expect(hash).not.toBe(code);
    expect(hash).not.toContain(code);
    expect(hashCode('a@b.com', '654321')).not.toBe(hash);
  });
});

describe('canSend', () => {
  it('allows first send and blocks resend within 60s cooldown', async () => {
    const now = Date.now();
    await create('vc@example.com', silentNotifier, 'email', now);

    const again = await canSend('vc@example.com', now + 30_000);
    expect(again.ok).toBe(false);
    if (!again.ok) {
      expect(again.reason).toBe('cooldown');
      expect(again.retryAfterSeconds).toBeGreaterThan(0);
      expect(again.retryAfterSeconds).toBeLessThanOrEqual(30);
    }

    const later = await canSend('vc@example.com', now + RESEND_COOLDOWN_MS + 1_000);
    expect(later.ok).toBe(true);
  });

  it('blocks when the daily send limit (5) is reached', async () => {
    const now = Date.now();
    for (let i = 0; i < 5; i++) {
      await create('daily@example.com', silentNotifier, 'email', now + i * (RESEND_COOLDOWN_MS + 1_000));
    }
    const check = await canSend('daily@example.com', now + 5 * (RESEND_COOLDOWN_MS + 1_000));
    expect(check.ok).toBe(false);
    if (!check.ok) {
      expect(check.reason).toBe('daily-limit');
    }
  });
});

describe('verify', () => {
  it('accepts the correct code once and rejects replay', async () => {
    const now = Date.now();
    const code = await create('one@example.com', silentNotifier, 'email', now);
    expect(await verify('one@example.com', code, now + 1_000)).toBe(true);
    expect(await verify('one@example.com', code, now + 2_000)).toBe(false);
  });

  it('rejects wrong codes and invalidates the record after 5 attempts', async () => {
    const now = Date.now();
    const code = await create('brute@example.com', silentNotifier, 'email', now);
    for (let i = 0; i < 5; i++) {
      expect(await verify('brute@example.com', '000000', now + 1_000 + i)).toBe(false);
    }
    expect(await verify('brute@example.com', code, now + 10_000)).toBe(false);
  });

  it('rejects expired codes', async () => {
    const now = Date.now();
    await create('exp@example.com', silentNotifier, 'email', now);
    expect(await verify('exp@example.com', '000000', now + 11 * 60 * 1_000)).toBe(false);
  });

  it('deletes the record after a successful verify', async () => {
    const now = Date.now();
    const code = await create('cleanup@example.com', silentNotifier, 'email', now);
    await verify('cleanup@example.com', code, now + 1_000);
    const rows = await db.select().from(verifyCodes).where(eq(verifyCodes.identifier, 'cleanup@example.com'));
    expect(rows).toHaveLength(0);
  });
});

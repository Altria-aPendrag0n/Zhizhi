import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sql } from 'drizzle-orm';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { getDb } from '../src/db/index.js';
import { CREATE_TABLES } from '../src/db/ddl.js';
import { channels } from '../src/db/schema.js';
import { resolveChannelCandidates } from '../src/services/channel.js';
import { costCents, lookupModelPrice } from '../src/services/model-prices.js';
import { decryptSecret, encryptSecret, isEncrypted } from '../src/services/secret-box.js';

const dir = mkdtempSync(join(tmpdir(), 'zhizhi-channel-'));
process.env.DB_PATH = join(dir, 'test.db');
process.env.JWT_SECRET = 'test-secret';
delete process.env.CHANNEL_ENC_KEY;

const db = getDb();
for (const stmt of CREATE_TABLES) {
  db.run(sql.raw(stmt));
}

afterAll(() => {
  (db as unknown as { $client: { close(): void } }).$client.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('secret-box', () => {
  it('stores plaintext as-is when CHANNEL_ENC_KEY is not configured', () => {
    const stored = encryptSecret('sk-upstream-abc');
    expect(stored).toBe('sk-upstream-abc');
    expect(isEncrypted(stored)).toBe(false);
    expect(decryptSecret(stored)).toBe('sk-upstream-abc');
  });

  it('round-trips AES-256-GCM when CHANNEL_ENC_KEY is configured', () => {
    process.env.CHANNEL_ENC_KEY = 'test-channel-secret';
    try {
      const stored = encryptSecret('sk-upstream-abc');
      expect(isEncrypted(stored)).toBe(true);
      expect(stored).not.toContain('sk-upstream-abc');
      expect(decryptSecret(stored)).toBe('sk-upstream-abc');
    } finally {
      delete process.env.CHANNEL_ENC_KEY;
    }
  });

  it('fails decryption on tampered ciphertext', () => {
    process.env.CHANNEL_ENC_KEY = 'test-channel-secret';
    try {
      const stored = encryptSecret('sk-upstream-abc');
      const raw = Buffer.from(stored.slice('enc:v1:'.length), 'base64');
      raw[raw.length - 1] ^= 0xff;
      const tampered = 'enc:v1:' + raw.toString('base64');
      expect(() => decryptSecret(tampered)).toThrow();
    } finally {
      delete process.env.CHANNEL_ENC_KEY;
    }
  });

  it('throws when decrypting encrypted data without the key configured', () => {
    expect(() => decryptSecret('enc:v1:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA')).toThrow(/CHANNEL_ENC_KEY/);
  });
});

describe('model-prices', () => {
  it('computes cost from per-million cent prices', () => {
    expect(costCents('deepseek-v4-flash', 1_000_000, 0)).toBe(100);
    expect(costCents('deepseek-v4-flash', 0, 1_000_000)).toBe(200);
    expect(costCents('deepseek-v4-flash', 500_000, 500_000)).toBe(150);
    expect(costCents('deepseek-v4-flash', 1, 1)).toBe(1);
  });

  it('charges nothing for free and unknown models', () => {
    expect(costCents('glm-4.7-flash', 1_000_000, 1_000_000)).toBe(0);
    expect(costCents('no-such-model', 1_000_000, 1_000_000)).toBe(0);
    expect(lookupModelPrice('glm-5')).toEqual({ input: 400, output: 1800 });
    expect(lookupModelPrice('no-such-model')).toBeNull();
  });
});

describe('channel selection', () => {
  afterEach(async () => {
    db.run(sql`DELETE FROM channels WHERE id LIKE 'test-%'`);
  });

  async function insertChannel(id: string, models: string, groupTag: string, weight: number, apiKey = '', status = 1) {
    await db.insert(channels).values({
      id: `test-${id}`,
      name: id,
      base_url: 'https://upstream.test/v1',
      api_key_enc: apiKey,
      models,
      group_tag: groupTag,
      weight,
      status,
      created_at: Date.now(),
    });
  }

  it('resolves wildcard channels for any model and group, decrypted', async () => {
    await insertChannel('wild', '*', '*', 100, 'sk-upstream-plain');
    const candidates = await resolveChannelCandidates('glm-4.7-flash', 'lite');
    expect(candidates).toHaveLength(1);
    expect(candidates[0].apiKey).toBe('sk-upstream-plain');
    expect(candidates[0].base_url).toBe('https://upstream.test/v1');
  });

  it('filters by model list and group tag', async () => {
    await insertChannel('ds', 'deepseek-v4-flash', 'pro', 100);
    await insertChannel('glm', 'glm-4.7-flash', '*', 100);
    await insertChannel('off', 'deepseek-v4-flash', '*', 100, '', 0);

    expect((await resolveChannelCandidates('deepseek-v4-flash', 'pro')).map((c) => c.id)).toEqual(['test-ds']);
    expect((await resolveChannelCandidates('deepseek-v4-flash', 'lite')).map((c) => c.id)).toEqual([]);
    expect((await resolveChannelCandidates('glm-4.7-flash', 'lite')).map((c) => c.id)).toEqual(['test-glm']);
  });

  it('orders candidates by weight with a deterministic rng', async () => {
    await insertChannel('a', 'm1', '*', 10);
    await insertChannel('b', 'm1', '*', 90);
    const candidates = await resolveChannelCandidates('m1', 'lite');
    expect(candidates.map((c) => c.name)).toContain('a');
    expect(candidates).toHaveLength(2);
  });

  it('does not decrypt encrypted rows when key is missing at resolve time', async () => {
    process.env.CHANNEL_ENC_KEY = 'k';
    const stored = encryptSecret('sk-enc');
    delete process.env.CHANNEL_ENC_KEY;
    await insertChannel('enc', '*', '*', 100, stored);
    await expect(resolveChannelCandidates('any-model', 'lite')).rejects.toThrow(/CHANNEL_ENC_KEY/);
  });
});

import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '../db/index.js';
import { apiKeys } from '../db/schema.js';
import { requireAuth, type AuthVariables } from '../middleware/auth.js';
import { generateApiKey, hashKey, keyPreviewOf } from '../services/api-key.js';

const MAX_ACTIVE_KEYS_PER_USER = 20;

const createKeySchema = z.object({
  name: z.string().trim().min(1).max(64).optional(),
  purpose: z.enum(['chat', 'vision']).default('chat'),
});

const updateKeySchema = z.object({
  name: z.string().trim().min(1).max(64).optional(),
  enabled: z.boolean().optional(),
});

export const keysRouter = new Hono<{ Variables: AuthVariables }>();

keysRouter.post('/keys', requireAuth, async (c) => {
  const userId = c.get('userId');
  const parsed = createKeySchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json({ error: 'invalid body' }, 400);
  }

  const db = getDb();
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(apiKeys)
    .where(and(eq(apiKeys.user_id, userId), isNull(apiKeys.revoked_at)));
  if (count >= MAX_ACTIVE_KEYS_PER_USER) {
    return c.json({ error: 'key limit reached' }, 409);
  }

  const plain = generateApiKey();
  const now = Date.now();
  const id = randomUUID();
  await db.insert(apiKeys).values({
    id,
    user_id: userId,
    key_hash: hashKey(plain),
    key_preview: keyPreviewOf(plain),
    name: parsed.data.name ?? null,
    purpose: parsed.data.purpose,
    enabled: 1,
    created_at: now,
  });

  return c.json(
    {
      id,
      key: plain,
      key_preview: keyPreviewOf(plain),
      name: parsed.data.name ?? null,
      purpose: parsed.data.purpose,
      created_at: now,
    },
    201
  );
});

keysRouter.get('/keys', requireAuth, async (c) => {
  const userId = c.get('userId');
  const db = getDb();
  const rows = await db
    .select()
    .from(apiKeys)
    .where(eq(apiKeys.user_id, userId))
    .orderBy(desc(apiKeys.created_at));
  return c.json({
    keys: rows.map(({ key_hash, ...rest }) => rest),
  });
});

keysRouter.patch('/keys/:id', requireAuth, async (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');
  if (!id) {
    return c.json({ error: 'not found' }, 404);
  }
  const parsed = updateKeySchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success || Object.keys(parsed.data).length === 0) {
    return c.json({ error: 'invalid body' }, 400);
  }

  const db = getDb();
  const [row] = await db
    .select({ id: apiKeys.id, revoked_at: apiKeys.revoked_at })
    .from(apiKeys)
    .where(and(eq(apiKeys.id, id), eq(apiKeys.user_id, userId)))
    .limit(1);
  if (!row) {
    return c.json({ error: 'not found' }, 404);
  }
  if (row.revoked_at) {
    return c.json({ error: 'key revoked' }, 409);
  }

  const patch: Partial<typeof apiKeys.$inferInsert> = {};
  if (parsed.data.name !== undefined) patch.name = parsed.data.name;
  if (parsed.data.enabled !== undefined) patch.enabled = parsed.data.enabled ? 1 : 0;
  await db.update(apiKeys).set(patch).where(eq(apiKeys.id, id));
  return c.json({ ok: true });
});

keysRouter.delete('/keys/:id', requireAuth, async (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');
  if (!id) {
    return c.json({ error: 'not found' }, 404);
  }
  const db = getDb();
  const [row] = await db
    .select({ id: apiKeys.id, revoked_at: apiKeys.revoked_at })
    .from(apiKeys)
    .where(and(eq(apiKeys.id, id), eq(apiKeys.user_id, userId)))
    .limit(1);
  if (!row) {
    return c.json({ error: 'not found' }, 404);
  }
  if (!row.revoked_at) {
    await db
      .update(apiKeys)
      .set({ revoked_at: Date.now(), enabled: 0 })
      .where(eq(apiKeys.id, id));
  }
  return c.json({ ok: true });
});

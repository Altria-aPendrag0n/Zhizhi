import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { apiKeys, plans, users } from '../db/schema.js';
import { requireAuth, type AuthVariables } from '../middleware/auth.js';

export const meRouter = new Hono<{ Variables: AuthVariables }>();

meRouter.get('/me', requireAuth, async (c) => {
  const userId = c.get('userId');
  const db = getDb();
  const user = await db.select().from(users).where(eq(users.id, userId)).limit(1).then((r) => r[0]);
  if (!user) {
    return c.json({ error: 'user not found' }, 404);
  }

  let plan = null;
  if (user.plan_id) {
    plan = await db.select().from(plans).where(eq(plans.id, user.plan_id)).limit(1).then((r) => r[0] ?? null);
  }

  const key = await db.select({ id: apiKeys.id }).from(apiKeys).where(eq(apiKeys.user_id, userId)).limit(1).then((r) => r[0]);

  return c.json({
    id: user.id,
    identifier: user.identifier,
    username: user.username ?? '',
    plan_id: user.plan_id,
    plan_expires_at: user.plan_expires_at,
    quota_tokens: user.quota_tokens,
    api_key_created: !!key,
    plan,
  });
});

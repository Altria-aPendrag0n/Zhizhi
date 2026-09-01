import { Hono } from 'hono';
import { and, eq, sql } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { apiKeys } from '../db/schema.js';
import { requireAuth, type AuthVariables } from '../middleware/auth.js';

const DEFAULT_DAYS = 30;
const MAX_DAYS = 365;

function sinceOf(days: number): number {
  return Date.now() - days * 24 * 60 * 60 * 1000;
}

function daysOf(query: string | undefined): number {
  const parsed = Number(query ?? DEFAULT_DAYS);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_DAYS;
  }
  return Math.min(MAX_DAYS, Math.floor(parsed));
}

const totalsSelect = sql`
  count(*) AS requests,
  COALESCE(SUM(prompt_tokens), 0) AS prompt_tokens,
  COALESCE(SUM(completion_tokens), 0) AS completion_tokens,
  COALESCE(SUM(cost_cents), 0) AS cost_cents
`;

export const usageRouter = new Hono<{ Variables: AuthVariables }>();

/** 单 Key 用量：按天与按模型聚合（仅本人） */
usageRouter.get('/keys/:id/usage', requireAuth, async (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');
  if (!id) {
    return c.json({ error: 'not found' }, 404);
  }
  const db = getDb();
  const [key] = await db
    .select({ id: apiKeys.id })
    .from(apiKeys)
    .where(and(eq(apiKeys.id, id), eq(apiKeys.user_id, userId)))
    .limit(1);
  if (!key) {
    return c.json({ error: 'not found' }, 404);
  }

  const days = daysOf(c.req.query('days'));
  const since = sinceOf(days);

  const [totals] = await db.all<{ requests: number; prompt_tokens: number; completion_tokens: number; cost_cents: number }>(sql`
    SELECT ${totalsSelect}
    FROM usage_logs
    WHERE api_key_id = ${id} AND created_at >= ${since}
  `);
  const daily = await db.all<{ day: string; requests: number; prompt_tokens: number; completion_tokens: number; cost_cents: number }>(sql`
    SELECT date(created_at / 1000, 'unixepoch', 'localtime') AS day, ${totalsSelect}
    FROM usage_logs
    WHERE api_key_id = ${id} AND created_at >= ${since}
    GROUP BY day
    ORDER BY day DESC
  `);
  const models = await db.all<{ model: string | null; requests: number; prompt_tokens: number; completion_tokens: number; cost_cents: number }>(sql`
    SELECT model, ${totalsSelect}
    FROM usage_logs
    WHERE api_key_id = ${id} AND created_at >= ${since}
    GROUP BY model
    ORDER BY requests DESC
  `);

  return c.json({ days, totals, daily, models });
});

/** 用户级用量汇总：余量 + 近 N 天聚合（仅本人） */
usageRouter.get('/usage/summary', requireAuth, async (c) => {
  const userId = c.get('userId');
  const db = getDb();

  const days = daysOf(c.req.query('days'));
  const since = sinceOf(days);

  const [user] = await db.all<{ quota_tokens: number }>(sql`
    SELECT quota_tokens FROM users WHERE id = ${userId}
  `);
  const [totals] = await db.all<{ requests: number; prompt_tokens: number; completion_tokens: number; cost_cents: number }>(sql`
    SELECT ${totalsSelect}
    FROM usage_logs
    WHERE user_id = ${userId} AND created_at >= ${since}
  `);
  const daily = await db.all<{ day: string; requests: number; prompt_tokens: number; completion_tokens: number; cost_cents: number }>(sql`
    SELECT date(created_at / 1000, 'unixepoch', 'localtime') AS day, ${totalsSelect}
    FROM usage_logs
    WHERE user_id = ${userId} AND created_at >= ${since}
    GROUP BY day
    ORDER BY day DESC
  `);
  const models = await db.all<{ model: string | null; requests: number; prompt_tokens: number; completion_tokens: number; cost_cents: number }>(sql`
    SELECT model, ${totalsSelect}
    FROM usage_logs
    WHERE user_id = ${userId} AND created_at >= ${since}
    GROUP BY model
    ORDER BY requests DESC
  `);

  return c.json({ days, quota_tokens: user?.quota_tokens ?? 0, totals, daily, models });
});

import type { Context, Next } from 'hono';
import { verifyAccessToken } from '../services/jwt.js';

export type AuthVariables = {
  userId: string;
  planId: string | null;
};

export async function requireAuth(c: Context<{ Variables: AuthVariables }>, next: Next): Promise<Response> {
  const header = c.req.header('Authorization');
  if (!header?.startsWith('Bearer ')) {
    return c.json({ error: 'unauthorized' }, 401);
  }
  const token = header.slice('Bearer '.length);
  try {
    const payload = await verifyAccessToken(token);
    c.set('userId', payload.sub);
    c.set('planId', payload.plan_id);
    await next();
    return c.res;
  } catch {
    return c.json({ error: 'unauthorized' }, 401);
  }
}

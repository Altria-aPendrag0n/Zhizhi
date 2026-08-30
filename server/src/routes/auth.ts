import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { createRateLimiter, ipKeyOf, rateLimit } from '../middleware/rate-limit.js';
import { login, logout, refresh } from '../services/auth.js';
import type { Notifier } from '../services/notifier.js';
import { canSend, create } from '../services/verify-code.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^1[3-9]\d{9}$/;

function isValidIdentifier(identifier: string): boolean {
  return EMAIL_RE.test(identifier) || PHONE_RE.test(identifier);
}

function channelOf(identifier: string): 'email' | 'sms' {
  return EMAIL_RE.test(identifier) ? 'email' : 'sms';
}

const sendCodeSchema = z.object({
  identifier: z.string().min(3).max(255),
  channel: z.enum(['email', 'sms']).optional(),
});

const loginSchema = z.object({
  identifier: z.string().min(3).max(255),
  code: z.string().regex(/^\d{6}$/, 'code must be 6 digits'),
  device_id: z.string().max(255).optional(),
});

const refreshSchema = z.object({
  refresh_token: z.string().min(10).max(512),
});

export function createAuthRouter(deps: { notifier: Notifier }): Hono {
  const router = new Hono();

  const sendCodePerIdentifier = createRateLimiter({ windowMs: 60_000, max: 1 });
  const sendCodePerIp = createRateLimiter({ windowMs: 600_000, max: 5 });
  const loginPerIp = createRateLimiter({ windowMs: 600_000, max: 10 });

  router.post(
    '/send-code',
    rateLimit(sendCodePerIdentifier, async (c) => {
      const body = (await c.req.json().catch(() => null)) as { identifier?: string } | null;
      return `identifier:${body?.identifier ?? 'unknown'}`;
    }),
    rateLimit(sendCodePerIp, ipKeyOf),
    zValidator('json', sendCodeSchema),
    async (c) => {
      const { identifier, channel } = c.req.valid('json');
      if (!isValidIdentifier(identifier)) {
        return c.json({ error: 'invalid identifier: must be an email or phone number' }, 400);
      }
      const check = await canSend(identifier);
      if (!check.ok) {
        return c.json(
          {
            error: check.reason === 'cooldown' ? 'cooldown' : 'daily send limit exceeded',
            cooldown_seconds: check.retryAfterSeconds,
          },
          429
        );
      }
      await create(identifier, deps.notifier, channel ?? channelOf(identifier));
      return c.json({ success: true, cooldown_seconds: 60 });
    }
  );

  router.post(
    '/login',
    rateLimit(loginPerIp, ipKeyOf),
    zValidator('json', loginSchema),
    async (c) => {
      const { identifier, code, device_id } = c.req.valid('json');
      if (!isValidIdentifier(identifier)) {
        return c.json({ error: 'invalid identifier: must be an email or phone number' }, 400);
      }
      const result = await login(identifier, code, device_id);
      if (!result.ok) {
        return c.json({ error: 'invalid verification code' }, 401);
      }
      return c.json({
        access_token: result.access_token,
        refresh_token: result.refresh_token,
        user: result.user,
        api_key: result.api_key,
      });
    }
  );

  router.post('/refresh', zValidator('json', refreshSchema), async (c) => {
    const { refresh_token } = c.req.valid('json');
    const result = await refresh(refresh_token);
    if (!result.ok) {
      return c.json({ error: 'invalid refresh token' }, 401);
    }
    return c.json({ access_token: result.access_token, refresh_token: result.refresh_token });
  });

  router.post('/logout', zValidator('json', refreshSchema), async (c) => {
    const { refresh_token } = c.req.valid('json');
    await logout(refresh_token);
    return c.json({ success: true });
  });

  return router;
}

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { createRateLimiter, ipKeyOf, rateLimit } from '../middleware/rate-limit.js';
import { login, logout, refresh, register } from '../services/auth.js';
import type { Notifier } from '../services/notifier.js';
import { canSend, create } from '../services/verify-code.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** 用户名/密码仅允许数字与大小写字母（需求限定） */
export const USERNAME_RE = /^[A-Za-z0-9]{3,32}$/;
export const PASSWORD_RE = /^[A-Za-z0-9]{6,64}$/;

const sendCodeSchema = z.object({
  identifier: z.string().min(3).max(255),
});

const registerSchema = z.object({
  email: z.string().min(3).max(255),
  code: z.string().regex(/^\d{6}$/, 'code must be 6 digits'),
  username: z.string().regex(USERNAME_RE, 'username must be 3-32 chars of letters/digits'),
  password: z.string().regex(PASSWORD_RE, 'password must be 6-64 chars of letters/digits'),
  device_id: z.string().max(255).optional(),
});

const loginSchema = z.object({
  username: z.string().min(3).max(32),
  password: z.string().min(6).max(64),
  device_id: z.string().max(255).optional(),
});

const refreshSchema = z.object({
  refresh_token: z.string().min(10).max(512),
});

export function createAuthRouter(deps: { notifier: Notifier }): Hono {
  const router = new Hono();

  const sendCodePerIdentifier = createRateLimiter({ windowMs: 60_000, max: 1 });
  const sendCodePerIp = createRateLimiter({ windowMs: 600_000, max: 5 });
  const registerPerIp = createRateLimiter({ windowMs: 600_000, max: 10 });
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
      const { identifier } = c.req.valid('json');
      if (!EMAIL_RE.test(identifier)) {
        return c.json({ error: 'invalid identifier: must be an email' }, 400);
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
      await create(identifier, deps.notifier, 'email');
      return c.json({ success: true, cooldown_seconds: 60 });
    }
  );

  router.post(
    '/register',
    rateLimit(registerPerIp, ipKeyOf),
    zValidator('json', registerSchema),
    async (c) => {
      const { email, code, username, password, device_id } = c.req.valid('json');
      if (!EMAIL_RE.test(email)) {
        return c.json({ error: 'invalid email' }, 400);
      }
      const result = await register({ email, code, username, password, deviceId: device_id });
      if (!result.ok) {
        if (result.reason === 'bad-code') {
          return c.json({ error: 'invalid verification code' }, 401);
        }
        if (result.reason === 'username-taken') {
          return c.json({ error: 'username already taken' }, 409);
        }
        if (result.reason === 'email-taken') {
          return c.json({ error: 'email already registered' }, 409);
        }
        return c.json({ error: 'registration failed' }, 400);
      }
      return c.json({
        access_token: result.access_token,
        refresh_token: result.refresh_token,
        user: result.user,
        api_key: result.api_key,
      });
    }
  );

  router.post(
    '/login',
    rateLimit(loginPerIp, ipKeyOf),
    zValidator('json', loginSchema),
    async (c) => {
      const { username, password, device_id } = c.req.valid('json');
      const result = await login({ username, password, deviceId: device_id });
      if (!result.ok) {
        return c.json({ error: 'invalid username or password' }, 401);
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

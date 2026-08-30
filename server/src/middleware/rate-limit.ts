import type { Context, Next } from 'hono';
import { getConnInfo } from '@hono/node-server/conninfo';

export interface RateLimiterOptions {
  windowMs: number;
  max: number;
}

export type RateLimitResult = { ok: true } | { ok: false; retryAfterSeconds: number };

export interface RateLimiter {
  check(key: string, now?: number): RateLimitResult;
  reset(key?: string): void;
}

export function createRateLimiter(options: RateLimiterOptions): RateLimiter {
  const hits = new Map<string, number[]>();

  return {
    check(key: string, now = Date.now()): RateLimitResult {
      const windowStart = now - options.windowMs;
      const arr = (hits.get(key) ?? []).filter((t) => t > windowStart);
      if (arr.length >= options.max) {
        const oldest = arr[0];
        return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((oldest + options.windowMs - now) / 1000)) };
      }
      arr.push(now);
      hits.set(key, arr);
      return { ok: true };
    },
    reset(key?: string): void {
      if (key === undefined) {
        hits.clear();
      } else {
        hits.delete(key);
      }
    },
  };
}

export function rateLimit(limiter: RateLimiter, keyFn: (c: Context) => string | Promise<string>) {
  return async (c: Context, next: Next): Promise<Response> => {
    const result = limiter.check(await keyFn(c));
    if (!result.ok) {
      return c.json({ error: 'rate limit exceeded', retry_after: result.retryAfterSeconds }, 429);
    }
    await next();
    return c.res;
  };
}

export function ipKeyOf(c: Context): string {
  try {
    const info = getConnInfo(c);
    if (info.remote?.address) {
      return `ip:${info.remote.address}`;
    }
  } catch {
    // 测试环境无真实连接信息，回退统一 key
  }
  return 'ip:unknown';
}

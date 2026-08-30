import { describe, expect, it } from 'vitest';
import { createRateLimiter } from '../src/middleware/rate-limit.js';

describe('createRateLimiter', () => {
  it('allows up to max requests within the window, then blocks', () => {
    const limiter = createRateLimiter({ windowMs: 10_000, max: 3 });
    expect(limiter.check('k', 0).ok).toBe(true);
    expect(limiter.check('k', 100).ok).toBe(true);
    expect(limiter.check('k', 200).ok).toBe(true);
    const blocked = limiter.check('k', 300);
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) {
      expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
      expect(blocked.retryAfterSeconds).toBeLessThanOrEqual(10);
    }
  });

  it('resets after the window elapses', () => {
    const limiter = createRateLimiter({ windowMs: 10_000, max: 3 });
    limiter.check('k', 0);
    limiter.check('k', 100);
    limiter.check('k', 200);
    expect(limiter.check('k', 300).ok).toBe(false);
    expect(limiter.check('k', 10_100).ok).toBe(true);
  });

  it('tracks keys independently', () => {
    const limiter = createRateLimiter({ windowMs: 10_000, max: 1 });
    expect(limiter.check('a', 0).ok).toBe(true);
    expect(limiter.check('b', 0).ok).toBe(true);
    expect(limiter.check('a', 100).ok).toBe(false);
    expect(limiter.check('b', 100).ok).toBe(false);
  });

  it('supports reset of a single key or all keys', () => {
    const limiter = createRateLimiter({ windowMs: 10_000, max: 1 });
    limiter.check('k', 0);
    limiter.reset('k');
    expect(limiter.check('k', 100).ok).toBe(true);

    limiter.check('a', 200);
    limiter.check('b', 200);
    limiter.reset();
    expect(limiter.check('a', 300).ok).toBe(true);
    expect(limiter.check('b', 300).ok).toBe(true);
  });
});

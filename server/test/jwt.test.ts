import { describe, expect, it } from 'vitest';
import { SignJWT } from 'jose';
import { signAccessToken, verifyAccessToken } from '../src/services/jwt.js';

process.env.JWT_SECRET = 'test-secret';

const encoder = new TextEncoder();

describe('jwt', () => {
  it('signs and verifies an access token', async () => {
    const token = await signAccessToken({ id: 'u1', plan_id: 'plan-lite' });
    const payload = await verifyAccessToken(token);
    expect(payload.sub).toBe('u1');
    expect(payload.plan_id).toBe('plan-lite');
  });

  it('round-trips null plan_id', async () => {
    const token = await signAccessToken({ id: 'u2', plan_id: null });
    const payload = await verifyAccessToken(token);
    expect(payload.sub).toBe('u2');
    expect(payload.plan_id).toBeNull();
  });

  it('rejects a token signed with a different secret', async () => {
    const token = await signAccessToken({ id: 'u1', plan_id: null }, 'other-secret');
    await expect(verifyAccessToken(token)).rejects.toThrow();
  });

  it('rejects an expired token', async () => {
    const expired = await new SignJWT({ plan_id: null })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('u1')
      .setIssuedAt(Math.floor(Date.now() / 1000) - 7_200)
      .setExpirationTime(new Date(Date.now() - 1_000))
      .sign(encoder.encode('test-secret'));
    await expect(verifyAccessToken(expired)).rejects.toThrow();
  });
});

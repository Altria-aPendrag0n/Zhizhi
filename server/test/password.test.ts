import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from '../src/services/password.js';

describe('password service（scrypt）', () => {
  it('hashes a password and verifies it round-trips', async () => {
    const hash = await hashPassword('Passw0rd');
    expect(hash).toMatch(/^scrypt:[0-9a-f]{32}:[0-9a-f]{64}$/);
    expect(hash).not.toContain('Passw0rd');
    expect(await verifyPassword('Passw0rd', hash)).toBe(true);
  });

  it('rejects a wrong password', async () => {
    const hash = await hashPassword('Passw0rd');
    expect(await verifyPassword('WrongPass', hash)).toBe(false);
  });

  it('produces a unique salt per hash (same password, different hash)', async () => {
    const a = await hashPassword('SamePass');
    const b = await hashPassword('SamePass');
    expect(a).not.toBe(b);
  });

  it('rejects malformed or empty stored values', async () => {
    expect(await verifyPassword('x', null)).toBe(false);
    expect(await verifyPassword('x', '')).toBe(false);
    expect(await verifyPassword('x', 'plain:not-a-hash')).toBe(false);
    expect(await verifyPassword('x', 'scrypt:bad')).toBe(false);
  });
});

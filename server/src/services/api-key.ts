import { createHash, randomBytes } from 'node:crypto';

export function generateApiKey(): string {
  return `sk-zhizhi-${randomBytes(24).toString('base64url')}`;
}

export function hashKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

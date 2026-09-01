import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const PREFIX = 'enc:v1:';

function derivedKey(): Buffer | null {
  const secret = process.env.CHANNEL_ENC_KEY;
  if (!secret) {
    return null;
  }
  return createHash('sha256').update(secret).digest();
}

export function isEncrypted(stored: string): boolean {
  return stored.startsWith(PREFIX);
}

/** 未配置 CHANNEL_ENC_KEY 时原样存储；配置后 AES-256-GCM 加密为 enc:v1:base64(iv|tag|ciphertext) */
export function encryptSecret(plain: string): string {
  const key = derivedKey();
  if (!key) {
    return plain;
  }
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + Buffer.concat([iv, tag, ciphertext]).toString('base64');
}

export function decryptSecret(stored: string): string {
  if (!isEncrypted(stored)) {
    return stored;
  }
  const key = derivedKey();
  if (!key) {
    throw new Error('CHANNEL_ENC_KEY is required to decrypt stored channel secrets');
  }
  const raw = Buffer.from(stored.slice(PREFIX.length), 'base64');
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const ciphertext = raw.subarray(28);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

import { createHash, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import { and, desc, eq, gte, sql } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { verifyCodes, verifySendLogs } from '../db/schema.js';
import type { Notifier } from './notifier.js';

export const CODE_TTL_MS = 10 * 60 * 1000;
export const RESEND_COOLDOWN_MS = 60 * 1000;
export const MAX_ATTEMPTS = 5;
export const DAILY_SEND_LIMIT = 5;

export function generateCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

export function hashCode(identifier: string, code: string): string {
  return createHash('sha256').update(`${identifier}:${code}`).digest('hex');
}

export type CanSendResult =
  | { ok: true }
  | { ok: false; reason: 'cooldown' | 'daily-limit'; retryAfterSeconds?: number };

export async function canSend(identifier: string, now = Date.now()): Promise<CanSendResult> {
  const db = getDb();
  const [last] = await db
    .select({ last_sent_at: verifyCodes.last_sent_at })
    .from(verifyCodes)
    .where(eq(verifyCodes.identifier, identifier))
    .orderBy(desc(verifyCodes.created_at))
    .limit(1);
  if (last?.last_sent_at) {
    const elapsed = now - last.last_sent_at;
    if (elapsed < RESEND_COOLDOWN_MS) {
      return {
        ok: false,
        reason: 'cooldown',
        retryAfterSeconds: Math.max(1, Math.ceil((RESEND_COOLDOWN_MS - elapsed) / 1000)),
      };
    }
  }
  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(verifySendLogs)
    .where(and(eq(verifySendLogs.identifier, identifier), gte(verifySendLogs.created_at, dayStart.getTime())));
  if (count >= DAILY_SEND_LIMIT) {
    return { ok: false, reason: 'daily-limit' };
  }
  return { ok: true };
}

export async function create(
  identifier: string,
  notifier: Notifier,
  channel = 'email',
  now = Date.now()
): Promise<string> {
  const db = getDb();
  const code = generateCode();
  await db.delete(verifyCodes).where(eq(verifyCodes.identifier, identifier));
  await db.insert(verifyCodes).values({
    id: randomUUID(),
    identifier,
    code_hash: hashCode(identifier, code),
    expires_at: now + CODE_TTL_MS,
    attempts: 0,
    last_sent_at: now,
    created_at: now,
  });
  await db.insert(verifySendLogs).values({ id: randomUUID(), identifier, created_at: now });
  await notifier.send(identifier, code, channel);
  return code;
}

export async function verify(identifier: string, inputCode: string, now = Date.now()): Promise<boolean> {
  const db = getDb();
  const [record] = await db
    .select()
    .from(verifyCodes)
    .where(eq(verifyCodes.identifier, identifier))
    .limit(1);
  if (!record) return false;
  if (record.expires_at <= now) {
    await db.delete(verifyCodes).where(eq(verifyCodes.id, record.id));
    return false;
  }
  if (record.attempts >= MAX_ATTEMPTS) {
    await db.delete(verifyCodes).where(eq(verifyCodes.id, record.id));
    return false;
  }
  const inputHash = hashCode(identifier, inputCode);
  const stored = Buffer.from(record.code_hash, 'hex');
  const input = Buffer.from(inputHash, 'hex');
  if (stored.length !== input.length || !timingSafeEqual(stored, input)) {
    await db
      .update(verifyCodes)
      .set({ attempts: record.attempts + 1 })
      .where(eq(verifyCodes.id, record.id));
    return false;
  }
  await db.delete(verifyCodes).where(eq(verifyCodes.id, record.id));
  return true;
}

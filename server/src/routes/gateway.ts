import { Hono } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '../db/index.js';
import { channels } from '../db/schema.js';
import { openAiError, requireApiKey, type GatewayContext, type GatewayVariables } from '../middleware/api-key-auth.js';
import { createRateLimiter, ipKeyOf, rateLimit } from '../middleware/rate-limit.js';
import { parseChannelModels, resolveChannelCandidates, type ChannelCandidate } from '../services/channel.js';

const DEFAULT_RPM = 60;
const MAX_RPM = 600;
const MAX_TOKENS_CLAMP = 32768;
const UPSTREAM_TIMEOUT_MS = 300_000;
/** 408/425/429/5xx 视为渠道临时故障 → 切换下一候选渠道 */
const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

const chatSchema = z
  .object({
    model: z.string().trim().min(1).max(200),
    messages: z.array(z.unknown()).min(1).max(200),
    stream: z.boolean().optional(),
    max_tokens: z.number().int().positive().optional(),
  })
  .passthrough();

interface KeyLimiterEntry {
  rpm: number;
  limiter: ReturnType<typeof createRateLimiter>;
}

const keyLimiters = new Map<string, KeyLimiterEntry>();
const gatewayPerIp = createRateLimiter({ windowMs: 60_000, max: 60 });

function keyLimiterOf(keyId: string, rpmLimit: number | null): ReturnType<typeof createRateLimiter> {
  const rpm = Math.min(MAX_RPM, Math.max(1, rpmLimit ?? DEFAULT_RPM));
  const existing = keyLimiters.get(keyId);
  if (existing && existing.rpm === rpm) {
    return existing.limiter;
  }
  const limiter = createRateLimiter({ windowMs: 60_000, max: rpm });
  keyLimiters.set(keyId, { rpm, limiter });
  if (keyLimiters.size > 50_000) {
    for (const id of keyLimiters.keys()) {
      keyLimiters.delete(id);
      if (keyLimiters.size <= 25_000) {
        break;
      }
    }
  }
  return limiter;
}

function anySignal(signals: AbortSignal[]): AbortSignal {
  const anyFn = (AbortSignal as unknown as { any?: (list: AbortSignal[]) => AbortSignal }).any;
  if (typeof anyFn === 'function') {
    return anyFn(signals);
  }
  const controller = new AbortController();
  for (const signal of signals) {
    signal.addEventListener('abort', () => controller.abort(signal.reason), { once: true });
  }
  return controller.signal;
}

async function attemptForward(
  channel: ChannelCandidate,
  body: Record<string, unknown>,
  stream: boolean,
  clientSignal: AbortSignal | null
): Promise<{ kind: 'response'; response: Response } | { kind: 'network' }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  const signal = clientSignal ? anySignal([clientSignal, controller.signal]) : controller.signal;
  try {
    const response = await fetch(`${channel.base_url}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'authorization': `Bearer ${channel.apiKey}`,
        'accept': stream ? 'text/event-stream' : 'application/json',
      },
      body: JSON.stringify(body),
      signal,
    });
    return { kind: 'response', response };
  } catch {
    return { kind: 'network' };
  } finally {
    clearTimeout(timer);
  }
}

async function handleChatCompletions(c: GatewayContext): Promise<Response> {
  const maxBodyBytes = Number(process.env.GATEWAY_MAX_BODY_BYTES ?? 10 * 1024 * 1024);
  const contentLength = Number(c.req.header('content-length') ?? 0);
  if (contentLength > maxBodyBytes) {
    return c.json(openAiError('Request body too large', 'invalid_request_error'), 413);
  }
  const raw = await c.req.arrayBuffer();
  if (raw.byteLength > maxBodyBytes) {
    return c.json(openAiError('Request body too large', 'invalid_request_error'), 413);
  }
  let json: unknown;
  try {
    json = JSON.parse(new TextDecoder().decode(raw));
  } catch {
    return c.json(openAiError('Invalid JSON body', 'invalid_request_error'), 400);
  }
  const parsed = chatSchema.safeParse(json);
  if (!parsed.success) {
    return c.json(openAiError('Invalid request body', 'invalid_request_error'), 400);
  }

  const key = c.get('gatewayKey');
  const user = c.get('gatewayUser');
  const group = c.get('modelGroup');
  const model = parsed.data.model;
  const stream = parsed.data.stream === true;

  if (key.allowedModels) {
    const allowed = key.allowedModels.split(',').map((s) => s.trim()).filter(Boolean);
    if (!allowed.includes(model)) {
      return c.json(
        openAiError(`Model ${model} is not allowed for this API key`, 'invalid_request_error', 'model_not_allowed'),
        403
      );
    }
  }

  const rpmResult = keyLimiterOf(key.id, key.rpmLimit).check(key.id);
  if (!rpmResult.ok) {
    return c.json(
      openAiError('Rate limit exceeded for this API key', 'rate_limit_error', 'rate_limit_exceeded'),
      429
    );
  }

  if (user.quotaTokens <= 0) {
    return c.json(openAiError('Quota exhausted, please top up', 'insufficient_quota', 'quota_exhausted'), 402);
  }
  if (key.quotaTokens > -1 && key.quotaTokens - key.usedTokens <= 0) {
    return c.json(openAiError('API key quota exhausted', 'insufficient_quota', 'quota_exhausted'), 402);
  }

  const candidates = await resolveChannelCandidates(model, group);
  if (candidates.length === 0) {
    return c.json(
      openAiError(`No available upstream for model ${model}`, 'invalid_request_error', 'model_not_available'),
      403
    );
  }

  const upstreamBody: Record<string, unknown> = { ...parsed.data };
  if (typeof upstreamBody.max_tokens === 'number') {
    upstreamBody.max_tokens = Math.min(upstreamBody.max_tokens, MAX_TOKENS_CLAMP);
  }
  if (stream) {
    upstreamBody.stream_options = { include_usage: true };
  }
  let injectedUsage = stream;

  let lastStatus = 502;
  let lastMessage = 'All upstream channels failed';
  for (const channel of candidates) {
    let attempts = injectedUsage ? 2 : 1;
    while (attempts-- > 0) {
      const result = await attemptForward(channel, upstreamBody, stream, c.req.raw.signal);
      if (result.kind === 'network') {
        lastStatus = 502;
        lastMessage = 'Upstream connection failed';
        break;
      }
      const { response } = result;
      if (response.ok) {
        if (stream) {
          return new Response(response.body, {
            status: 200,
            headers: {
              'content-type': 'text/event-stream; charset=utf-8',
              'cache-control': 'no-cache',
            },
          });
        }
        const body = (await response.json()) as Record<string, unknown>;
        return c.json(body);
      }
      const text = await response.text();
      lastStatus = response.status;
      if (response.status === 400 && injectedUsage) {
        delete upstreamBody.stream_options;
        injectedUsage = false;
        attempts = 1;
        continue;
      }
      if (RETRYABLE_STATUS.has(response.status)) {
        lastMessage = 'Upstream temporarily unavailable';
        break;
      }
      console.error(`[gateway] upstream ${channel.id} rejected with ${response.status}: ${text.slice(0, 500)}`);
      return c.json(openAiError('Upstream rejected the request', 'upstream_error'), response.status as ContentfulStatusCode);
    }
  }
  const status = RETRYABLE_STATUS.has(lastStatus) ? 502 : lastStatus;
  return c.json(openAiError(lastMessage, 'upstream_error'), status as ContentfulStatusCode);
}

export const gatewayRouter = new Hono<{ Variables: GatewayVariables }>();

gatewayRouter.post(
  '/v1/chat/completions',
  rateLimit(gatewayPerIp, ipKeyOf),
  requireApiKey,
  (c) => handleChatCompletions(c)
);

gatewayRouter.get('/v1/models', rateLimit(gatewayPerIp, ipKeyOf), requireApiKey, async (c) => {
  const group = c.get('modelGroup');
  const db = getDb();
  const rows = await db.select().from(channels).where(eq(channels.status, 1));
  const ids = new Set<string>();
  for (const row of rows) {
    if (row.group_tag === '*' || row.group_tag === group) {
      for (const model of parseChannelModels(row.models)) {
        if (model !== '*') {
          ids.add(model);
        }
      }
    }
  }
  return c.json({
    object: 'list',
    data: [...ids].sort().map((id) => ({ id, object: 'model', owned_by: 'zhizhi' })),
  });
});

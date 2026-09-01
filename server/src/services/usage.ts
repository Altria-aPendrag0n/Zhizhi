import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { usageLogs } from '../db/schema.js';
import { costCents } from './model-prices.js';

export interface UsageStats {
  promptTokens: number;
  completionTokens: number;
}

/** 约 1.6 字符/token 的中文场景粗估，仅在上游未返回 usage 时兜底 */
export function estimateTokens(chars: number): number {
  return Math.ceil(chars / 1.6);
}

interface OpenAiUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
}

function toStats(usage: OpenAiUsage | undefined): UsageStats | null {
  if (!usage || typeof usage.prompt_tokens !== 'number' || typeof usage.completion_tokens !== 'number') {
    return null;
  }
  return { promptTokens: usage.prompt_tokens, completionTokens: usage.completion_tokens };
}

/** 从非流式响应体提取 usage */
export function extractUsageFromBody(body: Record<string, unknown> | null): UsageStats | null {
  return toStats(body?.usage as OpenAiUsage | undefined);
}

/**
 * 增量解析 SSE 字节流：透传字节原样返回给客户端，同时捕获末 chunk 的 usage
 * （stream_options.include_usage 启用后最后一个 chunk 的 choices 为空数组、携带 usage）
 * 并累计 delta.content 字符数用于无 usage 时的估算兜底。
 */
export class SseUsageExtractor {
  private decoder = new TextDecoder('utf-8');
  private buffer = '';
  private usage: UsageStats | null = null;
  private contentChars = 0;

  push(bytes: Uint8Array): void {
    this.buffer += this.decoder.decode(bytes, { stream: true });
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() ?? '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) {
        continue;
      }
      const payload = trimmed.slice(5).trim();
      if (!payload || payload === '[DONE]') {
        continue;
      }
      try {
        const event = JSON.parse(payload) as {
          choices?: Array<{ delta?: { content?: string } }>;
          usage?: OpenAiUsage;
        };
        const stats = toStats(event.usage);
        if (stats) {
          this.usage = stats;
        }
        for (const choice of event.choices ?? []) {
          this.contentChars += choice.delta?.content?.length ?? 0;
        }
      } catch {
        // 跳过无法解析的 SSE 行
      }
    }
  }

  result(): { usage: UsageStats | null; contentChars: number } {
    return { usage: this.usage, contentChars: this.contentChars };
  }
}

export interface RecordUsageInput {
  userId: string;
  apiKeyId: string;
  channelId: string | null;
  model: string;
  /** 上游返回的精确 usage；为 null 时按字符估算并标记 estimated=1 */
  usage: UsageStats | null;
  promptChars: number;
  completionChars: number;
  status: 'success' | 'aborted';
  latencyMs: number;
}

/**
 * 记账（better-sqlite3 同步执行）：明细入 usage_logs → 无条件扣减用户池与子 Key 累计。
 * 预检在请求前完成，扣减为后置无条件执行：并发滥用下余量可能小幅击穿为负，
 * 随后预检（<=0 拒绝）会立即封住，属可接受的 MVP 语义（与 one-api 的预检+后扣一致）。
 */
export function recordUsage(input: RecordUsageInput): void {
  const db = getDb();
  const promptTokens = input.usage?.promptTokens ?? estimateTokens(input.promptChars);
  const completionTokens = input.usage?.completionTokens ?? estimateTokens(input.completionChars);
  const estimated = input.usage === null ? 1 : 0;
  const cost = costCents(input.model, promptTokens, completionTokens);
  const now = Date.now();

  db.insert(usageLogs)
    .values({
      id: randomUUID(),
      user_id: input.userId,
      api_key_id: input.apiKeyId,
      channel_id: input.channelId,
      model: input.model,
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      cost_cents: cost,
      status: input.status,
      latency_ms: input.latencyMs,
      estimated,
      created_at: now,
    })
    .run();

  db.run(sql`UPDATE users SET quota_tokens = quota_tokens - ${promptTokens + completionTokens} WHERE id = ${input.userId}`);
  db.run(
    sql`UPDATE api_keys
        SET used_tokens = used_tokens + ${promptTokens + completionTokens},
            last_used_at = ${now}
        WHERE id = ${input.apiKeyId}`
  );
}

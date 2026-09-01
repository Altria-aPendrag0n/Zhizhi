import { randomUUID } from 'node:crypto';
import type { Hono, Context } from 'hono';
import type Database from 'better-sqlite3';
import { decryptSecret, encryptSecret, isEncrypted } from './services/secret-box.js';

type Sqlite = Database.Database;

export class HttpError extends Error {
  constructor(
    public status: 400 | 404 | 500,
    message: string,
  ) {
    super(message);
  }
}

export function likeEscape(term: string): string {
  return term.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

function all<T>(sqlite: Sqlite, sql: string, ...params: unknown[]): T[] {
  return sqlite.prepare(sql).all(...params) as T[];
}

function get<T>(sqlite: Sqlite, sql: string, ...params: unknown[]): T | undefined {
  return sqlite.prepare(sql).get(...params) as T | undefined;
}

function asError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function readJsonObject(c: Context): Promise<Record<string, unknown>> {
  try {
    const body = (await c.req.json()) as unknown;
    if (body === null || typeof body !== 'object' || Array.isArray(body)) {
      throw new Error('not an object');
    }
    return body as Record<string, unknown>;
  } catch {
    throw new HttpError(400, '请求体必须是 JSON 对象');
  }
}

function requireString(body: Record<string, unknown>, field: string, maxLen = 512): string {
  const value = body[field];
  if (typeof value !== 'string' || !value.trim()) {
    throw new HttpError(400, `缺少有效字段：${field}`);
  }
  const trimmed = value.trim();
  if (trimmed.length > maxLen) {
    throw new HttpError(400, `字段过长：${field}`);
  }
  return trimmed;
}

function optionalString(body: Record<string, unknown>, field: string, maxLen = 4096): string | undefined {
  const value = body[field];
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== 'string') {
    throw new HttpError(400, `字段必须是字符串：${field}`);
  }
  const trimmed = value.trim();
  if (trimmed.length > maxLen) {
    throw new HttpError(400, `字段过长：${field}`);
  }
  return trimmed;
}

function clampInt(body: Record<string, unknown>, field: string, min: number, max: number, fallback: number): number {
  const value = body[field];
  if (value === undefined || value === null || value === '') {
    return fallback;
  }
  const num = Number(value);
  if (!Number.isFinite(num)) {
    throw new HttpError(400, `字段必须是数字：${field}`);
  }
  return Math.min(max, Math.max(min, Math.trunc(num)));
}

/** 上游 Key 掩码展示：仅本地控制台可见，永不回传完整 Key */
export function maskSecret(stored: string): string {
  if (!stored) {
    return '';
  }
  let plain: string;
  try {
    plain = decryptSecret(stored);
  } catch {
    return '（解密失败：缺少 CHANNEL_ENC_KEY）';
  }
  if (!plain) {
    return '';
  }
  if (plain.length <= 12) {
    return '••••••';
  }
  return plain.slice(0, 6) + '••••' + plain.slice(-4);
}

interface ChannelRow {
  id: string;
  name: string;
  base_url: string;
  api_key_enc: string;
  models: string;
  group_tag: string;
  weight: number;
  status: number;
  created_at: number | null;
}

function channelView(row: ChannelRow) {
  const { api_key_enc, ...rest } = row;
  return {
    ...rest,
    has_key: !!api_key_enc,
    key_is_encrypted: isEncrypted(api_key_enc),
    key_masked: maskSecret(api_key_enc),
  };
}

function getChannel(sqlite: Sqlite, id: string): ChannelRow | undefined {
  return get<ChannelRow>(sqlite, 'SELECT * FROM channels WHERE id = ?', id);
}

/** 注册综合管理台 API（数据库管理之外的运营端点），仅监听 127.0.0.1 的本地信任边界 */
export function registerAdminRoutes(app: Hono, sqlite: Sqlite): void {
  // ===== 渠道管理 =====

  app.get('/api/admin/channels', (c) => {
    const rows = all<ChannelRow>(sqlite, 'SELECT * FROM channels ORDER BY created_at DESC, name');
    return c.json({ channels: rows.map(channelView) });
  });

  app.post('/api/admin/channels', async (c) => {
    const body = await readJsonObject(c);
    const name = requireString(body, 'name', 100);
    const baseUrl = requireString(body, 'base_url');
    if (!/^https?:\/\//i.test(baseUrl)) {
      throw new HttpError(400, 'base_url 必须以 http(s):// 开头');
    }
    const apiKey = optionalString(body, 'api_key', 512);
    const models = optionalString(body, 'models', 2000) ?? '*';
    const groupTag = optionalString(body, 'group_tag', 64) ?? '*';
    const weight = clampInt(body, 'weight', 1, 10_000, 100);
    const status = clampInt(body, 'status', 0, 1, 1);

    const id = 'ch-' + randomUUID();
    sqlite
      .prepare(
        `INSERT INTO channels (id, name, base_url, api_key_enc, models, group_tag, weight, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(id, name, baseUrl.replace(/\/+$/, ''), apiKey ? encryptSecret(apiKey) : '', models, groupTag, weight, status, Date.now());
    return c.json({ channel: channelView(getChannel(sqlite, id)!) }, 201);
  });

  app.patch('/api/admin/channels/:id', async (c) => {
    const id = c.req.param('id');
    const row = getChannel(sqlite, id);
    if (!row) {
      throw new HttpError(404, '渠道不存在：' + id);
    }
    const body = await readJsonObject(c);
    const sets: string[] = [];
    const params: unknown[] = [];

    const name = optionalString(body, 'name', 100);
    if (name !== undefined) {
      sets.push('name = ?');
      params.push(name);
    }
    const baseUrl = optionalString(body, 'base_url');
    if (baseUrl !== undefined) {
      if (!/^https?:\/\//i.test(baseUrl)) {
        throw new HttpError(400, 'base_url 必须以 http(s):// 开头');
      }
      sets.push('base_url = ?');
      params.push(baseUrl.replace(/\/+$/, ''));
    }
    const apiKey = optionalString(body, 'api_key', 512);
    if (apiKey !== undefined) {
      sets.push('api_key_enc = ?');
      params.push(apiKey ? encryptSecret(apiKey) : '');
    }
    const models = optionalString(body, 'models', 2000);
    if (models !== undefined) {
      sets.push('models = ?');
      params.push(models);
    }
    const groupTag = optionalString(body, 'group_tag', 64);
    if (groupTag !== undefined) {
      sets.push('group_tag = ?');
      params.push(groupTag);
    }
    if (body.weight !== undefined && body.weight !== '') {
      sets.push('weight = ?');
      params.push(clampInt(body, 'weight', 1, 10_000, row.weight));
    }
    if (body.status !== undefined && body.status !== '') {
      sets.push('status = ?');
      params.push(clampInt(body, 'status', 0, 1, row.status));
    }

    if (sets.length === 0) {
      throw new HttpError(400, '没有需要更新的字段');
    }
    sqlite.prepare(`UPDATE channels SET ${sets.join(', ')} WHERE id = ?`).run(...params, id);
    return c.json({ channel: channelView(getChannel(sqlite, id)!) });
  });

  app.delete('/api/admin/channels/:id', (c) => {
    const id = c.req.param('id');
    const info = sqlite.prepare('DELETE FROM channels WHERE id = ?').run(id);
    if (Number(info.changes) === 0) {
      throw new HttpError(404, '渠道不存在：' + id);
    }
    return c.json({ deleted: Number(info.changes) });
  });

  /** 连通性测试：GET {base_url}/v1/models，10 秒超时；只返回状态与预览，不回传上游 Key */
  app.post('/api/admin/channels/:id/test', async (c) => {
    const id = c.req.param('id');
    const row = getChannel(sqlite, id);
    if (!row) {
      throw new HttpError(404, '渠道不存在：' + id);
    }
    if (!row.api_key_enc) {
      throw new HttpError(400, '渠道尚未配置上游 Key');
    }
    let apiKey: string;
    try {
      apiKey = decryptSecret(row.api_key_enc);
    } catch (err) {
      throw new HttpError(400, '上游 Key 解密失败：' + asError(err));
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    const startedAt = Date.now();
    try {
      const response = await fetch(`${row.base_url}/v1/models`, {
        headers: { authorization: `Bearer ${apiKey}` },
        signal: controller.signal,
      });
      const text = await response.text();
      return c.json({
        ok: response.ok,
        status: response.status,
        latency_ms: Date.now() - startedAt,
        preview: text.slice(0, 300),
      });
    } catch (err) {
      const aborted = err instanceof Error && err.name === 'AbortError';
      return c.json({
        ok: false,
        status: 0,
        latency_ms: Date.now() - startedAt,
        error: aborted ? '连接超时（10s）' : asError(err),
      });
    } finally {
      clearTimeout(timer);
    }
  });

  // ===== 子 Key 管理 =====

  app.get('/api/admin/keys', (c) => {
    const search = (c.req.query('search') ?? '').trim();
    const userId = (c.req.query('userId') ?? '').trim();
    const status = (c.req.query('status') ?? '').trim();

    const where: string[] = [];
    const params: unknown[] = [];
    if (search) {
      where.push('(k.key_preview LIKE ? OR k.name LIKE ? OR u.username LIKE ? OR u.identifier LIKE ?)');
      const like = `%${likeEscape(search)}%`;
      params.push(like, like, like, like);
    }
    if (userId) {
      where.push('k.user_id = ?');
      params.push(userId);
    }
    if (status === 'active') {
      where.push('k.revoked_at IS NULL AND k.enabled = 1');
    } else if (status === 'revoked') {
      where.push('k.revoked_at IS NOT NULL');
    } else if (status === 'disabled') {
      where.push('k.revoked_at IS NULL AND k.enabled = 0');
    }

    const sqlText = `
      SELECT k.id, k.user_id, k.key_preview, k.name, k.purpose, k.enabled, k.quota_tokens, k.used_tokens,
             k.expired_at, k.allowed_models, k.rpm_limit, k.created_at, k.last_used_at, k.revoked_at,
             u.username, u.identifier
      FROM api_keys k
      LEFT JOIN users u ON u.id = k.user_id
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY k.created_at DESC
      LIMIT 500`;
    return c.json({ keys: all(sqlite, sqlText, ...params) });
  });

  app.patch('/api/admin/keys/:id', async (c) => {
    const id = c.req.param('id');
    const exists = get<{ id: string }>(sqlite, 'SELECT id FROM api_keys WHERE id = ?', id);
    if (!exists) {
      throw new HttpError(404, '子 Key 不存在：' + id);
    }
    const body = await readJsonObject(c);
    const sets: string[] = [];
    const params: unknown[] = [];

    const name = optionalString(body, 'name', 64);
    if (name !== undefined) {
      sets.push('name = ?');
      params.push(name);
    }
    if (body.enabled !== undefined && body.enabled !== '') {
      const enabled = Number(body.enabled);
      if (enabled !== 0 && enabled !== 1) {
        throw new HttpError(400, 'enabled 只允许 0 或 1');
      }
      sets.push('enabled = ?');
      params.push(enabled);
    }
    for (const field of ['quota_tokens', 'rpm_limit', 'expired_at'] as const) {
      if (body[field] !== undefined) {
        if (body[field] === null || body[field] === '') {
          sets.push(`${field} = NULL`);
        } else {
          const num = Number(body[field]);
          if (!Number.isFinite(num)) {
            throw new HttpError(400, `字段必须是数字或 null：${field}`);
          }
          sets.push(`${field} = ?`);
          params.push(Math.trunc(num));
        }
      }
    }
    if (body.allowed_models !== undefined) {
      if (body.allowed_models === null || body.allowed_models === '') {
        sets.push('allowed_models = NULL');
      } else if (typeof body.allowed_models === 'string') {
        sets.push('allowed_models = ?');
        params.push(body.allowed_models.trim());
      } else {
        throw new HttpError(400, 'allowed_models 必须是字符串或 null');
      }
    }

    if (sets.length === 0) {
      throw new HttpError(400, '没有需要更新的字段');
    }
    sqlite.prepare(`UPDATE api_keys SET ${sets.join(', ')} WHERE id = ?`).run(...params, id);
    return c.json({ ok: true });
  });

  app.delete('/api/admin/keys/:id', (c) => {
    const id = c.req.param('id');
    const row = get<{ revoked_at: number | null }>(sqlite, 'SELECT revoked_at FROM api_keys WHERE id = ?', id);
    if (!row) {
      throw new HttpError(404, '子 Key 不存在：' + id);
    }
    if (row.revoked_at === null) {
      sqlite.prepare('UPDATE api_keys SET revoked_at = ?, enabled = 0 WHERE id = ?').run(Date.now(), id);
    }
    return c.json({ ok: true });
  });

  // ===== 用户管理 =====

  app.get('/api/admin/users', (c) => {
    const search = (c.req.query('search') ?? '').trim();
    const where = search ? 'WHERE u.username LIKE ? OR u.identifier LIKE ?' : '';
    const like = `%${likeEscape(search)}%`;
    const rows = all(
      sqlite,
      `SELECT u.id, u.identifier, u.username, u.plan_id, u.plan_expires_at, u.quota_tokens, u.created_at,
              p.name AS plan_name, p.model_group AS plan_model_group,
              (SELECT COUNT(*) FROM api_keys k WHERE k.user_id = u.id AND k.revoked_at IS NULL) AS active_keys,
              (SELECT COALESCE(SUM(k.used_tokens), 0) FROM api_keys k WHERE k.user_id = u.id) AS used_tokens
       FROM users u
       LEFT JOIN plans p ON p.id = u.plan_id
       ${where}
       ORDER BY u.created_at DESC
       LIMIT 500`,
      ...(search ? [like, like] : []),
    );
    return c.json({ users: rows });
  });

  app.post('/api/admin/users/:id/quota', async (c) => {
    const id = c.req.param('id');
    const row = get<{ quota_tokens: number }>(sqlite, 'SELECT quota_tokens FROM users WHERE id = ?', id);
    if (!row) {
      throw new HttpError(404, '用户不存在：' + id);
    }
    const body = await readJsonObject(c);
    let next: number;
    if (body.set !== undefined && body.set !== '') {
      const num = Number(body.set);
      if (!Number.isFinite(num) || num < 0) {
        throw new HttpError(400, 'set 必须是非负数字');
      }
      next = Math.trunc(num);
    } else if (body.delta !== undefined && body.delta !== '') {
      const num = Number(body.delta);
      if (!Number.isFinite(num) || !Number.isInteger(num)) {
        throw new HttpError(400, 'delta 必须是整数');
      }
      next = row.quota_tokens + num;
    } else {
      throw new HttpError(400, '缺少 delta 或 set 字段');
    }
    sqlite.prepare('UPDATE users SET quota_tokens = ?, updated_at = ? WHERE id = ?').run(next, Date.now(), id);
    return c.json({ quota_tokens: next });
  });

  // ===== 总览统计 =====

  app.get('/api/admin/overview', (c) => {
    const days = clampInt({ days: c.req.query('days') }, 'days', 1, 90, 7);
    const since = Date.now() - days * 24 * 60 * 60 * 1000;
    const midnight = new Date();
    midnight.setHours(0, 0, 0, 0);
    const todayStart = midnight.getTime();

    const usageTotals = (sinceTs: number) =>
      get<{ requests: number; tokens: number; cost_cents: number }>(
        sqlite,
        `SELECT COUNT(*) AS requests,
                COALESCE(SUM(prompt_tokens + completion_tokens), 0) AS tokens,
                COALESCE(SUM(cost_cents), 0) AS cost_cents
         FROM usage_logs WHERE created_at >= ?`,
        sinceTs,
      )!;

    const daily = all(
      sqlite,
      `SELECT date(created_at / 1000, 'unixepoch', 'localtime') AS day,
              COUNT(*) AS requests,
              COALESCE(SUM(prompt_tokens + completion_tokens), 0) AS tokens,
              COALESCE(SUM(cost_cents), 0) AS cost_cents
       FROM usage_logs WHERE created_at >= ?
       GROUP BY day ORDER BY day DESC`,
      since,
    );

    const topModels = all(
      sqlite,
      `SELECT model, COUNT(*) AS requests,
              COALESCE(SUM(prompt_tokens + completion_tokens), 0) AS tokens,
              COALESCE(SUM(cost_cents), 0) AS cost_cents
       FROM usage_logs WHERE created_at >= ?
       GROUP BY model ORDER BY tokens DESC LIMIT 10`,
      since,
    );

    const topUsers = all(
      sqlite,
      `SELECT u.id, u.username, u.identifier,
              COUNT(*) AS requests,
              COALESCE(SUM(l.prompt_tokens + l.completion_tokens), 0) AS tokens,
              COALESCE(SUM(l.cost_cents), 0) AS cost_cents
       FROM usage_logs l
       LEFT JOIN users u ON u.id = l.user_id
       WHERE l.created_at >= ?
       GROUP BY l.user_id ORDER BY tokens DESC LIMIT 10`,
      since,
    );

    const quality = get<{ estimated: number; aborted: number }>(
      sqlite,
      `SELECT COALESCE(SUM(estimated), 0) AS estimated,
               SUM(CASE WHEN status = 'aborted' THEN 1 ELSE 0 END) AS aborted
       FROM usage_logs WHERE created_at >= ?`,
      since,
    )!;

    return c.json({
      cards: {
        users_total: Number(get<{ c: number }>(sqlite, 'SELECT COUNT(*) AS c FROM users')!.c),
        keys_active: Number(get<{ c: number }>(sqlite, 'SELECT COUNT(*) AS c FROM api_keys WHERE revoked_at IS NULL AND enabled = 1')!.c),
        channels_enabled: Number(get<{ c: number }>(sqlite, 'SELECT COUNT(*) AS c FROM channels WHERE status = 1')!.c),
        channels_total: Number(get<{ c: number }>(sqlite, 'SELECT COUNT(*) AS c FROM channels')!.c),
        quota_sum: Number(get<{ c: number }>(sqlite, 'SELECT COALESCE(SUM(quota_tokens), 0) AS c FROM users')!.c),
      },
      today: usageTotals(todayStart),
      window: {
        days,
        totals: usageTotals(since),
        quality: { estimated: Number(quality.estimated), aborted: Number(quality.aborted ?? 0) },
        daily,
        top_models: topModels,
        top_users: topUsers,
      },
    });
  });
}

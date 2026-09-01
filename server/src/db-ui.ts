import { serve } from '@hono/node-server';
import { Hono, type Context } from 'hono';
import { pathToFileURL } from 'node:url';
import Database from 'better-sqlite3';
import { DB_UI_HTML } from './db-ui-page.js';
import { createApp } from './app.js';
import { HttpError, registerAdminRoutes } from './db-ui-admin.js';

type Sqlite = Database.Database;

const ROWS_CAP = 500;

function quoteIdent(name: string): string {
  return '"' + name.replace(/"/g, '""') + '"';
}

function likeEscape(term: string): string {
  return term.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

function listTables(sqlite: Sqlite): string[] {
  const rows = sqlite
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    )
    .all() as Array<{ name: string }>;
  return rows.map((row) => row.name);
}

function tableExists(sqlite: Sqlite, name: string): boolean {
  return (
    sqlite.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name) !==
    undefined
  );
}

function tableColumns(sqlite: Sqlite, name: string): Array<{ name: string; type: string }> {
  const rows = sqlite
    .prepare(`PRAGMA table_info(${quoteIdent(name)})`)
    .all() as Array<{ name: string; type: string }>;
  return rows.map((row) => ({ name: row.name, type: row.type }));
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

function asError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function createDbUiApp(sqlite: Sqlite): Hono {
  const app = new Hono();

  app.get('/', (c) => c.html(DB_UI_HTML));

  app.get('/api/meta', (c) => {
    const tables = listTables(sqlite).map((name) => {
      const row = sqlite.prepare(`SELECT COUNT(*) AS c FROM ${quoteIdent(name)}`).get() as {
        c: number;
      };
      return { name, count: Number(row.c) };
    });
    return c.json({ dbPath: sqlite.name, tables });
  });

  app.get('/api/tables/:name', (c) => {
    const name = c.req.param('name');
    if (!tableExists(sqlite, name)) {
      throw new HttpError(404, '表不存在：' + name);
    }
    const cols = tableColumns(sqlite, name);
    const colNames = cols.map((col) => col.name);

    const sizeReq = Number(c.req.query('size') ?? 50);
    const size = Number.isFinite(sizeReq) ? Math.min(Math.max(Math.trunc(sizeReq), 1), 200) : 50;
    const pageReq = Number(c.req.query('page') ?? 1);
    const pageIn = Number.isFinite(pageReq) && pageReq >= 1 ? Math.trunc(pageReq) : 1;

    const orderCol = c.req.query('order') ?? '';
    if (orderCol && !colNames.includes(orderCol)) {
      throw new HttpError(400, '不支持的排序字段：' + orderCol);
    }
    const dir = c.req.query('dir') === 'desc' ? 'DESC' : 'ASC';

    const search = (c.req.query('search') ?? '').trim();
    const likeValue = '%' + likeEscape(search) + '%';
    const where = search
      ? ' WHERE ' + colNames.map((col) => quoteIdent(col) + " LIKE ? ESCAPE '\\'").join(' OR ')
      : '';
    const params: string[] = search ? colNames.map(() => likeValue) : [];

    const totalRow = sqlite
      .prepare(`SELECT COUNT(*) AS c FROM ${quoteIdent(name)}${where}`)
      .get(...params) as { c: number };
    const total = Number(totalRow.c);
    const pages = Math.max(1, Math.ceil(total / size));
    const page = Math.min(pageIn, pages);
    const offset = (page - 1) * size;

    const orderBy = orderCol ? quoteIdent(orderCol) + ' ' + dir + ', rowid ' + dir : 'rowid';
    const rows = sqlite
      .prepare(
        `SELECT rowid AS __rid, * FROM ${quoteIdent(name)}${where} ORDER BY ${orderBy} LIMIT ? OFFSET ?`,
      )
      .all(...params, size, offset);

    return c.json({ name, columns: cols, rows, total, page, size, pages });
  });

  app.post('/api/tables/:name/delete', async (c) => {
    const name = c.req.param('name');
    if (!tableExists(sqlite, name)) {
      throw new HttpError(404, '表不存在：' + name);
    }
    const body = await readJsonObject(c);
    const rid = body.rid;
    if (typeof rid !== 'number' || !Number.isInteger(rid) || rid < 1) {
      throw new HttpError(400, '缺少有效的行标识 rid');
    }
    const info = sqlite.prepare(`DELETE FROM ${quoteIdent(name)} WHERE rowid = ?`).run(rid);
    return c.json({ deleted: Number(info.changes) });
  });

  function runExec(c: Context, sqlText: string): Response {
    try {
      const info = sqlite.prepare(sqlText).run();
      return c.json({
        mode: 'exec',
        changes: Number(info.changes),
        lastInsertRowid: String(info.lastInsertRowid),
      });
    } catch (err) {
      throw new HttpError(400, 'SQL 执行失败：' + asError(err));
    }
  }

  app.post('/api/sql', async (c) => {
    const body = await readJsonObject(c);
    if (typeof body.sql !== 'string' || !body.sql.trim()) {
      throw new HttpError(400, '缺少 sql 字段');
    }
    const sqlText = body.sql.trim().replace(/;+\s*$/, '');
    if (sqlText.includes(';')) {
      throw new HttpError(400, '一次只允许执行一条语句（去掉多余的分号）');
    }
    const isQuery = /^\s*(select|pragma|explain|with)\b/i.test(sqlText);
    if (!isQuery) {
      return runExec(c, sqlText);
    }
    let rows: unknown[];
    try {
      rows = sqlite.prepare(sqlText).all();
    } catch (err) {
      const msg = asError(err);
      if (/run\(\) instead/i.test(msg)) {
        return runExec(c, sqlText);
      }
      throw new HttpError(400, 'SQL 执行失败：' + msg);
    }
    const truncated = rows.length > ROWS_CAP;
    const columns = rows.length
      ? Object.keys(rows[0] as Record<string, unknown>).map((key) => ({ name: key, type: '' }))
      : [];
    return c.json({ mode: 'rows', columns, rows: rows.slice(0, ROWS_CAP), truncated });
  });

  app.onError((err, c) => {
    if (err instanceof HttpError) {
      return c.json({ error: err.message }, err.status);
    }
    return c.json({ error: err.message }, 500);
  });

  registerAdminRoutes(app, sqlite);

  return app;
}

const argv1 = process.argv[1];
const isMain = typeof argv1 === 'string' && import.meta.url === pathToFileURL(argv1).href;

if (isMain) {
  const dbPath = process.env.DB_PATH ?? './data/zhizhi.db';
  const sqlite = new Database(dbPath);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  const port = Number(process.env.DB_UI_PORT ?? 8790);
  const uiServer = serve({ fetch: createDbUiApp(sqlite).fetch, hostname: '127.0.0.1', port }, (info) => {
    console.log(`[db-ui] SQLite 控制台已启动: http://127.0.0.1:${info.port}（数据库: ${dbPath}）`);
  });
  uiServer.on('error', (err: NodeJS.ErrnoException) => {
    const reason = err.code === 'EADDRINUSE' ? `端口 ${port} 已被占用` : err.message;
    console.error(`[db-ui] 控制台启动失败: ${reason}`);
    process.exit(1);
  });

  if (process.env.JWT_SECRET) {
    const apiPort = Number(process.env.PORT ?? 8787);
    const apiServer = serve({ fetch: createApp().fetch, port: apiPort }, (info) => {
      console.log(`[db-ui] 主服务已自动启动: http://localhost:${info.port}`);
    });
    apiServer.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        console.warn(`[db-ui] 端口 ${apiPort} 已被占用（主服务可能已在运行），跳过自动启动。`);
      } else {
        console.error(`[db-ui] 主服务启动失败: ${err.message}`);
      }
    });
  } else {
    console.error('[db-ui] 未设置 JWT_SECRET，主服务未自动启动（仅数据库控制台可用）。');
  }
}

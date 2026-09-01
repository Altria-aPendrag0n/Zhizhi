import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { AuthVariables } from './middleware/auth.js';
import type { Notifier } from './services/notifier.js';
import { createNotifier } from './services/notifier.js';
import { createAuthRouter } from './routes/auth.js';
import { keysRouter } from './routes/keys.js';
import { meRouter } from './routes/me.js';

/** 生产环境 CORS 白名单：Tauri WebView 的 origin（Windows: tauri://localhost；macOS/Linux: http(s)://tauri.localhost）+ 开发服务器 */
const DEFAULT_CORS_ORIGINS = [
  'tauri://localhost',
  'http://tauri.localhost',
  'https://tauri.localhost',
  'http://localhost:1420',
];

function corsOrigins(): string[] | undefined {
  const envOrigins = process.env.CORS_ORIGIN;
  if (envOrigins) {
    return envOrigins.split(',').map((s) => s.trim()).filter(Boolean);
  }
  if (process.env.NODE_ENV === 'production') {
    return DEFAULT_CORS_ORIGINS;
  }
  // 开发/测试：允许所有 Origin（cors 缺省行为）
  return undefined;
}

export function createApp(opts: { notifier?: Notifier } = {}): Hono<{ Variables: AuthVariables }> {
  const app = new Hono<{ Variables: AuthVariables }>();
  const origins = corsOrigins();
  app.use('*', cors(origins ? { origin: origins } : undefined));

  const notifier = opts.notifier ?? createNotifier();
  app.route('/api/auth', createAuthRouter({ notifier }));
  app.route('/api', keysRouter);
  app.route('/api', meRouter);

  app.onError((err, c) => {
    const isProd = process.env.NODE_ENV === 'production';
    console.error('[app] unhandled error:', err);
    return c.json({ error: isProd ? 'internal error' : err.message }, 500);
  });

  return app;
}

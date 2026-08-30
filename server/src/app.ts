import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { AuthVariables } from './middleware/auth.js';
import type { Notifier } from './services/notifier.js';
import { createNotifier } from './services/notifier.js';
import { createAuthRouter } from './routes/auth.js';
import { meRouter } from './routes/me.js';

export function createApp(opts: { notifier?: Notifier } = {}): Hono<{ Variables: AuthVariables }> {
  const app = new Hono<{ Variables: AuthVariables }>();
  app.use('*', cors());

  const notifier = opts.notifier ?? createNotifier();
  app.route('/api/auth', createAuthRouter({ notifier }));
  app.route('/api', meRouter);

  app.onError((err, c) => {
    const isProd = process.env.NODE_ENV === 'production';
    console.error('[app] unhandled error:', err);
    return c.json({ error: isProd ? 'internal error' : err.message }, 500);
  });

  return app;
}

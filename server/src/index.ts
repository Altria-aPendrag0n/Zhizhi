import { serve } from '@hono/node-server';
import { createApp } from './app.js';

const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret) {
  console.error('JWT_SECRET is required (see .env.example)');
  process.exit(1);
}

const port = Number(process.env.PORT ?? 8787);
serve({ fetch: createApp().fetch, port });
console.log(`[server] listening on http://localhost:${port}`);

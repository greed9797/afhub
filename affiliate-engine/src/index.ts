import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import accountsRoutes from './routes/accounts.js';
import approvalsRoutes from './routes/approvals.js';
import nichesRoutes from './routes/niches.js';
import productsRoutes from './routes/products.js';
import publicationsRoutes from './routes/publications.js';
import scannerRoutes from './routes/scanner.js';
import settingsRoutes from './routes/settings.js';
import videosRoutes from './routes/videos.js';
import analyticsRoutes, { trackingRedirect } from './routes/analytics.js';
import webhooksRoutes from './routes/webhooks.js';
import { internalAuth } from './middleware/auth.js';
import { rateLimit } from './middleware/rate-limit.js';
import { closeQueues } from './lib/queues.js';
import { startOAuthRefreshScheduler } from './services/oauth.js';

const app = new Hono();

app.use('*', logger());
app.use('*', cors({ origin: process.env.CORS_ORIGIN?.split(',') ?? ['http://localhost:3000'], credentials: true }));
app.use('/api/*', rateLimit());
app.use('/api/*', internalAuth);

app.get('/health', (c) =>
  c.json({
    ok: true,
    service: 'affiliate-engine',
    timestamp: new Date().toISOString(),
  }),
);

const api = new Hono();
app.route('/api/r', trackingRedirect);
api.route('/accounts', accountsRoutes);
api.route('/niches', nichesRoutes);
api.route('/scanner', scannerRoutes);
api.route('/approvals', approvalsRoutes);
api.route('/products', productsRoutes);
api.route('/videos', videosRoutes);
api.route('/publications', publicationsRoutes);
api.route('/settings', settingsRoutes);
api.route('/analytics', analyticsRoutes);
api.route('/webhooks', webhooksRoutes);
app.route('/api', api);

app.notFound((c) => c.json({ error: 'Not found' }, 404));
app.onError((error, c) => {
  console.error('[hono] unhandled error:', error.message);
  return c.json({ error: error.message }, 500);
});

const port = Number(process.env.PORT ?? 3001);
const refreshTimer = startOAuthRefreshScheduler();
const server = serve({ fetch: app.fetch, port }, (info) => {
  console.log(`[affiliate-engine] listening on http://localhost:${info.port}`);
});

async function shutdown(code = 0): Promise<void> {
  clearInterval(refreshTimer);
  await closeQueues().catch((error) => console.error('[shutdown] queue close failed:', error));
  server.close((error) => {
    if (error) {
      console.error('[shutdown] server close failed:', error);
      process.exit(1);
    }
    process.exit(code);
  });
}

process.on('SIGINT', () => void shutdown(0));
process.on('SIGTERM', () => void shutdown(0));

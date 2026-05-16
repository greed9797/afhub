import { timingSafeEqual } from 'node:crypto';
import { createMiddleware } from 'hono/factory';

function safeCompare(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export const internalAuth = createMiddleware(async (c, next) => {
  if (c.req.path === '/api/webhooks/telegram' || c.req.path.startsWith('/api/r/')) {
    await next();
    return;
  }

  const expected = process.env.INTERNAL_API_KEY;
  if (!expected) {
    return c.json({ error: 'INTERNAL_API_KEY is not configured.' }, 500);
  }

  const authorization = c.req.header('authorization') ?? '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice('Bearer '.length) : '';
  if (!token || !safeCompare(token, expected)) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  await next();
});

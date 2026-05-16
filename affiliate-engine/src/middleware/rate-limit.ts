import { createMiddleware } from 'hono/factory';

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

export function rateLimit(maxRequests = 120, windowMs = 60_000) {
  return createMiddleware(async (c, next) => {
    const key = c.req.header('x-forwarded-for') ?? 'local';
    const now = Date.now();
    const bucket = buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      await next();
      return;
    }

    bucket.count += 1;
    if (bucket.count > maxRequests) {
      return c.json({ error: 'Rate limit exceeded' }, 429);
    }

    await next();
  });
}

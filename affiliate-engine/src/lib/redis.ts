import { Redis } from 'ioredis';

function redisUrl(): string {
  const url = process.env.UPSTASH_REDIS_URL || process.env.REDIS_URL || process.env.BULLMQ_REDIS_URL;
  if (!url) {
    throw new Error(
      'BullMQ requires a TCP Redis URL in UPSTASH_REDIS_URL, REDIS_URL, or BULLMQ_REDIS_URL. UPSTASH_REDIS_REST_URL is HTTP-only and cannot back BullMQ workers.',
    );
  }
  if (url.startsWith('http')) {
    throw new Error('BullMQ cannot use UPSTASH_REDIS_REST_URL. Use the Upstash rediss:// Redis URL instead.');
  }
  return url;
}

export function createRedisConnection(): Redis {
  const url = redisUrl();
  return new Redis(url, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    tls: url.startsWith('rediss://') ? {} : undefined,
  });
}

export function createQueueConnection(): Redis {
  const url = redisUrl();
  return new Redis(url, {
    enableReadyCheck: false,
    tls: url.startsWith('rediss://') ? {} : undefined,
  });
}

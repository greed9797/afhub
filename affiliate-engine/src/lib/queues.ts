import { Queue, type JobsOptions } from 'bullmq';
import { createQueueConnection } from './redis.js';

const defaultJobOptions: JobsOptions = {
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 60_000,
  },
  removeOnComplete: 200,
  removeOnFail: 500,
};

let affiliateQueue: Queue | null = null;
let videoQueue: Queue | null = null;
let publicationQueue: Queue | null = null;

export function getAffiliateQueue(): Queue {
  affiliateQueue ??= new Queue('affiliate-queue', {
    connection: createQueueConnection(),
    defaultJobOptions,
  });
  return affiliateQueue;
}

export function getVideoGenerationQueue(): Queue {
  videoQueue ??= new Queue('video-generation-queue', {
    connection: createQueueConnection(),
    defaultJobOptions: {
      ...defaultJobOptions,
      backoff: { type: 'exponential', delay: 300_000 },
    },
  });
  return videoQueue;
}

export function getPublicationQueue(): Queue {
  publicationQueue ??= new Queue('publication-queue', {
    connection: createQueueConnection(),
    defaultJobOptions,
  });
  return publicationQueue;
}

export async function closeQueues(): Promise<void> {
  await Promise.all([affiliateQueue?.close(), videoQueue?.close(), publicationQueue?.close()]);
}

import { Worker } from 'bullmq';
import { connectorFor } from '../connectors/index.js';
import { createRedisConnection } from '../lib/redis.js';
import { getSupabase } from '../lib/supabase.js';
import { getVideoGenerationQueue } from '../lib/queues.js';
import { selectAccount } from '../services/scanner.js';
import type { ProductCandidate } from '../types.js';

const productBucket = 'affiliate-products';

async function downloadAndStoreImages(candidate: ProductCandidate): Promise<string[]> {
  const urls = (candidate.imagens ?? []).slice(0, 8);
  const stored: string[] = [];

  for (const [index, url] of urls.entries()) {
    const response = await fetch(url);
    if (!response.ok) continue;
    const contentType = response.headers.get('content-type') ?? 'image/jpeg';
    const extension = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg';
    const path = `products/${candidate.id}/img_${index}.${extension}`;
    const buffer = Buffer.from(await response.arrayBuffer());
    const { error } = await getSupabase().storage.from(productBucket).upload(path, buffer, {
      contentType,
      upsert: true,
    });
    if (error) throw error;
    const { data } = getSupabase().storage.from(productBucket).getPublicUrl(path);
    stored.push(data.publicUrl);
  }

  return stored;
}

async function processAffiliateJob(candidateId: string): Promise<void> {
  const { data, error } = await getSupabase()
    .from('product_candidates')
    .select('*')
    .eq('id', candidateId)
    .single();

  if (error || !data) {
    throw error ?? new Error(`Candidate not found: ${candidateId}`);
  }

  const candidate = data as ProductCandidate;
  if (!candidate.niche_id) {
    throw new Error(`Candidate ${candidateId} has no niche_id.`);
  }

  const account = await selectAccount(candidate.platform, candidate.niche_id);
  const connector = connectorFor(candidate.platform);
  const affiliateLink = await connector.affiliate(account.id, candidate.product_id);
  const imagensStorage = await downloadAndStoreImages(candidate);

  const { data: affiliated, error: insertError } = await getSupabase()
    .from('affiliated_products')
    .insert({
      account_id: account.id,
      candidate_id: candidate.id,
      affiliate_link: affiliateLink.url,
      platform: candidate.platform,
      link_generation_method: affiliateLink.method,
      imagens_storage: imagensStorage,
    })
    .select('*')
    .single();

  if (insertError || !affiliated) {
    throw insertError ?? new Error('Could not insert affiliated product.');
  }

  const queue = getVideoGenerationQueue();
  await queue.add('generate-product-video', {
    affiliatedProductId: affiliated.id,
    type: 'product',
  });
  await queue.add(
    'generate-lifestyle-video',
    {
      affiliatedProductId: affiliated.id,
      type: 'lifestyle',
    },
    { delay: 10 * 60 * 1000 },
  );
}

const worker = new Worker(
  'affiliate-queue',
  async (job) => {
    const candidateId = String(job.data.candidateId ?? '');
    if (!candidateId) throw new Error('candidateId is required.');
    await processAffiliateJob(candidateId);
  },
  {
    connection: createRedisConnection(),
    concurrency: 3,
  },
);

worker.on('completed', (job) => console.log(`[affiliate-worker] completed ${job.id}`));
worker.on('failed', (job, error) => console.error(`[affiliate-worker] failed ${job?.id}:`, error.message));

process.on('SIGINT', () => worker.close().then(() => process.exit(0)));
process.on('SIGTERM', () => worker.close().then(() => process.exit(0)));

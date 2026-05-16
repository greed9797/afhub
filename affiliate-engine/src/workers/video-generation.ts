import { Worker } from 'bullmq';
import { getPublicationQueue } from '../lib/queues.js';
import { createRedisConnection } from '../lib/redis.js';
import { getSupabase } from '../lib/supabase.js';
import { pollVeoOperation, submitVeoJob } from '../lib/vertex.js';
import { generateVeoPrompt } from '../services/prompt-generator.js';
import type { VideoJobType } from '../types.js';

const videoBucket = 'affiliate-videos';

type VideoContext = {
  affiliatedProduct: {
    id: string;
    affiliate_link: string;
    imagens_storage: string[] | null;
    product_candidates: {
      nome: string;
      descricao: string | null;
      preco: number | null;
      niches?: { nome?: string } | null;
    };
  };
};

async function fetchContext(affiliatedProductId: string): Promise<VideoContext['affiliatedProduct']> {
  const { data, error } = await getSupabase()
    .from('affiliated_products')
    .select('*, product_candidates(*, niches(nome))')
    .eq('id', affiliatedProductId)
    .single();
  if (error || !data) throw error ?? new Error(`Affiliated product not found: ${affiliatedProductId}`);
  return data as VideoContext['affiliatedProduct'];
}

async function storeVideo(jobId: string, result: string): Promise<string> {
  let buffer: Buffer;
  if (result.startsWith('data:video/mp4;base64,')) {
    buffer = Buffer.from(result.replace('data:video/mp4;base64,', ''), 'base64');
  } else if (result.startsWith('http')) {
    const response = await fetch(result);
    if (!response.ok) throw new Error(`Could not download Vertex video: ${response.status}`);
    buffer = Buffer.from(await response.arrayBuffer());
  } else {
    throw new Error(`Unsupported Vertex video result URI: ${result.slice(0, 80)}`);
  }

  const path = `videos/${jobId}.mp4`;
  const { error } = await getSupabase().storage.from(videoBucket).upload(path, buffer, {
    contentType: 'video/mp4',
    upsert: true,
  });
  if (error) throw error;
  const { data } = getSupabase().storage.from(videoBucket).getPublicUrl(path);
  return data.publicUrl;
}

async function processVideoJob(affiliatedProductId: string, type: VideoJobType, retryOf?: string): Promise<void> {
  const product = await fetchContext(affiliatedProductId);
  const candidate = product.product_candidates;
  const prompt = await generateVeoPrompt({
    productName: candidate.nome,
    productDescription: candidate.descricao ?? '',
    niche: candidate.niches?.nome ?? 'general',
    type,
    price: Number(candidate.preco ?? 0),
  });

  const { data: videoJob, error: insertError } = await getSupabase()
    .from('video_jobs')
    .insert({
      affiliated_product_id: affiliatedProductId,
      type,
      prompt,
      status: 'generating',
      retry_count: retryOf ? 1 : 0,
    })
    .select('*')
    .single();
  if (insertError || !videoJob) throw insertError ?? new Error('Could not create video job.');

  try {
    const operationName = await submitVeoJob({
      prompt,
      imageUrls: type === 'product' ? product.imagens_storage?.slice(0, 3) ?? [] : [],
      aspectRatio: '9:16',
      durationSeconds: type === 'product' ? 8 : 12,
    });

    await getSupabase().from('video_jobs').update({ vertex_operation_name: operationName }).eq('id', videoJob.id);

    let result: string | null = null;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 15_000));
      result = await pollVeoOperation(operationName);
      if (result) break;
    }

    if (!result) throw new Error('Vertex AI timeout');
    const videoUrl = await storeVideo(videoJob.id, result);
    await getSupabase()
      .from('video_jobs')
      .update({
        status: 'done',
        video_url: videoUrl,
        completed_at: new Date().toISOString(),
      })
      .eq('id', videoJob.id);

    await getPublicationQueue().add('plan-publications', { videoJobId: videoJob.id });
  } catch (error) {
    await getSupabase()
      .from('video_jobs')
      .update({
        status: 'failed',
        error_message: error instanceof Error ? error.message : 'unknown error',
      })
      .eq('id', videoJob.id);
    throw error;
  }
}

const worker = new Worker(
  'video-generation-queue',
  async (job) => {
    const affiliatedProductId = String(job.data.affiliatedProductId ?? '');
    const type = String(job.data.type ?? '') as VideoJobType;
    if (!affiliatedProductId || !['product', 'lifestyle'].includes(type)) {
      throw new Error('affiliatedProductId and type are required.');
    }
    await processVideoJob(affiliatedProductId, type, job.data.retryOf ? String(job.data.retryOf) : undefined);
  },
  {
    connection: createRedisConnection(),
    concurrency: 2,
  },
);

worker.on('completed', (job) => console.log(`[video-worker] completed ${job.id}`));
worker.on('failed', (job, error) => console.error(`[video-worker] failed ${job?.id}:`, error.message));

process.on('SIGINT', () => worker.close().then(() => process.exit(0)));
process.on('SIGTERM', () => worker.close().then(() => process.exit(0)));

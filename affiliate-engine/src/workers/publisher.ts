import { Worker } from 'bullmq';
import { createRedisConnection } from '../lib/redis.js';
import { getSupabase } from '../lib/supabase.js';
import { getPublicationQueue } from '../lib/queues.js';
import { buildTrackedAffiliateUrl } from '../lib/tracking.js';
import { generatePublicationContent } from '../services/prompt-generator.js';
import { publishToInstagram } from '../services/publishers/instagram.js';
import { publishToTikTok } from '../services/publishers/tiktok.js';
import { publishToYouTube } from '../services/publishers/youtube.js';
import type { PublishPlatform } from '../types.js';

type PublicationContext = {
  id: string;
  video_url: string;
  affiliated_products: {
    id: string;
    affiliate_link: string;
    account_id: string;
    affiliate_accounts?: { channel_ids?: Record<string, unknown> };
    product_candidates: {
      nome: string;
      preco: number | null;
      niches?: { nome?: string } | null;
    };
  };
};

const publishPlatforms: PublishPlatform[] = ['tiktok', 'youtube', 'instagram'];

function configuredPlatforms(channelIds: Record<string, unknown> | undefined): PublishPlatform[] {
  if (!channelIds) return [];
  return publishPlatforms.filter((platform) => Boolean(channelIds[platform] || channelIds[`${platform}_user_id`] || channelIds[`${platform}_channel_id`]));
}

function nextSlot(base = new Date()): Date {
  const slotHours = (process.env.PUBLISH_SLOTS ?? '11:00,19:00')
    .split(',')
    .map((slot) => slot.trim())
    .filter(Boolean);
  const candidates = slotHours.map((slot) => {
    const [hour, minute] = slot.split(':').map(Number);
    const date = new Date(base);
    date.setHours(hour, minute || 0, 0, 0);
    if (date <= base) date.setDate(date.getDate() + 1);
    return date;
  });
  candidates.sort((a, b) => a.getTime() - b.getTime());
  return candidates[0] ?? new Date(base.getTime() + 60 * 60 * 1000);
}

async function ensureFourHourSpacing(accountId: string, desired: Date): Promise<Date> {
  const { data } = await getSupabase()
    .from('publications')
    .select('scheduled_for, published_at')
    .eq('account_id', accountId)
    .in('status', ['scheduled', 'published'])
    .order('scheduled_for', { ascending: false })
    .limit(1);

  const lastRaw = data?.[0]?.scheduled_for ?? data?.[0]?.published_at;
  if (!lastRaw) return desired;
  const minTime = new Date(lastRaw).getTime() + 4 * 60 * 60 * 1000;
  if (desired.getTime() >= minTime) return desired;
  return nextSlot(new Date(minTime));
}

async function fetchVideoContext(videoJobId: string): Promise<PublicationContext> {
  const { data, error } = await getSupabase()
    .from('video_jobs')
    .select('*, affiliated_products(*, affiliate_accounts(channel_ids), product_candidates(*, niches(nome)))')
    .eq('id', videoJobId)
    .single();
  if (error || !data) throw error ?? new Error(`Video job not found: ${videoJobId}`);
  return data as PublicationContext;
}

async function planPublications(videoJobId: string): Promise<void> {
  const video = await fetchVideoContext(videoJobId);
  if (!video.video_url) throw new Error(`Video job ${videoJobId} has no video_url.`);
  const affiliated = video.affiliated_products;
  const candidate = affiliated.product_candidates;
  const channels = configuredPlatforms(affiliated.affiliate_accounts?.channel_ids);
  const queue = getPublicationQueue();

  for (const platform of channels) {
    const scheduledFor = await ensureFourHourSpacing(affiliated.account_id, nextSlot());
    const { data: publication, error } = await getSupabase()
      .from('publications')
      .insert({
        video_job_id: video.id,
        account_id: affiliated.account_id,
        publish_platform: platform,
        status: 'scheduled',
        scheduled_for: scheduledFor.toISOString(),
      })
      .select('*')
      .single();
    if (error || !publication) throw error ?? new Error('Could not create publication.');

    const trackedAffiliateLink = buildTrackedAffiliateUrl(affiliated.id, {
      publicationId: publication.id,
      utmSource: 'publication',
      utmMedium: platform,
      utmCampaign: 'tracked-publication',
    });
    const content = await generatePublicationContent({
      productName: candidate.nome,
      niche: candidate.niches?.nome ?? 'general',
      price: Number(candidate.preco ?? 0),
      platform,
      affiliateLink: trackedAffiliateLink,
    });

    const { error: updateError } = await getSupabase()
      .from('publications')
      .update({
        title: content.title,
        description: content.description,
        hashtags: content.hashtags,
        affiliate_link: trackedAffiliateLink,
      })
      .eq('id', publication.id);
    if (updateError) throw updateError;
    await queue.add('publish-single', { publicationId: publication.id }, { delay: Math.max(scheduledFor.getTime() - Date.now(), 0) });
  }
}

async function publishSingle(publicationId: string): Promise<void> {
  const { data, error } = await getSupabase()
    .from('publications')
    .select('*, video_jobs(video_url), affiliate_accounts(channel_ids)')
    .eq('id', publicationId)
    .single();
  if (error || !data) throw error ?? new Error(`Publication not found: ${publicationId}`);

  const videoUrl = (data.video_jobs as { video_url?: string } | null)?.video_url;
  if (!videoUrl) throw new Error(`Publication ${publicationId} has no video URL.`);
  const hashtags = (data.hashtags ?? []) as string[];
  const description = [data.description, ...hashtags.map((tag: string) => `#${tag.replace(/^#/, '')}`)].filter(Boolean).join('\n\n');

  try {
    const externalPostId =
      data.publish_platform === 'tiktok'
        ? await publishToTikTok({
            accountId: data.account_id,
            videoPath: videoUrl,
            title: data.title,
            description,
            hashtags,
          })
        : data.publish_platform === 'youtube'
          ? await publishToYouTube({
              accountId: data.account_id,
              videoPath: videoUrl,
              title: data.title,
              description,
              tags: hashtags,
            })
          : await publishToInstagram({
              accountId: data.account_id,
              videoUrl,
              caption: `${description}\n\nLink na bio`,
            });

    await getSupabase()
      .from('publications')
      .update({
        status: 'published',
        published_at: new Date().toISOString(),
        external_post_id: externalPostId,
        error_message: null,
      })
      .eq('id', publicationId);
  } catch (publishError) {
    await getSupabase()
      .from('publications')
      .update({
        status: 'failed',
        error_message: publishError instanceof Error ? publishError.message : 'unknown error',
      })
      .eq('id', publicationId);
    throw publishError;
  }
}

const worker = new Worker(
  'publication-queue',
  async (job) => {
    if (job.data.publicationId) {
      await publishSingle(String(job.data.publicationId));
      return;
    }
    if (job.data.videoJobId) {
      await planPublications(String(job.data.videoJobId));
      return;
    }
    throw new Error('publicationId or videoJobId is required.');
  },
  {
    connection: createRedisConnection(),
    concurrency: 3,
  },
);

worker.on('completed', (job) => console.log(`[publisher-worker] completed ${job.id}`));
worker.on('failed', (job, error) => console.error(`[publisher-worker] failed ${job?.id}:`, error.message));

process.on('SIGINT', () => worker.close().then(() => process.exit(0)));
process.on('SIGTERM', () => worker.close().then(() => process.exit(0)));

import { pathToFileURL } from 'node:url';
import { getPublicationQueue } from '../lib/queues.js';
import { getSupabase } from '../lib/supabase.js';

export async function runPublishCron(limit = 10): Promise<{ enqueued: number }> {
  const { data, error } = await getSupabase()
    .from('publications')
    .select('id')
    .eq('status', 'scheduled')
    .lte('scheduled_for', new Date().toISOString())
    .order('scheduled_for', { ascending: true })
    .limit(limit);

  if (error) throw error;
  const queue = getPublicationQueue();
  for (const publication of data ?? []) {
    await queue.add(
      'publish-single',
      { publicationId: publication.id },
      { jobId: `publish-single:${publication.id}` },
    );
  }
  return { enqueued: data?.length ?? 0 };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const intervalMs = Number(process.env.PUBLISH_CRON_INTERVAL_MS ?? 5 * 60 * 1000);
  console.log(`[publish-cron] running every ${intervalMs}ms`);
  runPublishCron().catch((error) => console.error('[publish-cron] initial sweep failed:', error));
  setInterval(() => {
    runPublishCron()
      .then((result) => console.log(`[publish-cron] enqueued ${result.enqueued} publications`))
      .catch((error) => console.error('[publish-cron] sweep failed:', error));
  }, intervalMs);
}

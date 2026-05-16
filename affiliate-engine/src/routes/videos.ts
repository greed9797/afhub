import { Hono } from 'hono';
import { getVideoGenerationQueue } from '../lib/queues.js';
import { getSupabase } from '../lib/supabase.js';

const videos = new Hono();

videos.get('/', async (c) => {
  let query = getSupabase()
    .from('video_jobs')
    .select('*, affiliated_products(*, product_candidates(nome, platform, niche_id, niches(nome)))')
    .order('created_at', { ascending: false })
    .limit(100);
  const status = c.req.query('status');
  const type = c.req.query('type');
  if (status) query = query.eq('status', status);
  if (type) query = query.eq('type', type);
  const { data, error } = await query;
  if (error) return c.json({ error: error.message }, 500);
  return c.json({ data });
});

videos.post('/:id/retry', async (c) => {
  const { data, error } = await getSupabase().from('video_jobs').select('*').eq('id', c.req.param('id')).single();
  if (error || !data) return c.json({ error: error?.message ?? 'Video job not found.' }, 404);
  await getVideoGenerationQueue().add('generate-video', {
    affiliatedProductId: data.affiliated_product_id,
    type: data.type,
    retryOf: data.id,
  });
  return c.json({ ok: true });
});

export default videos;

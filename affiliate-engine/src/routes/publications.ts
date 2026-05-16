import { Hono } from 'hono';
import { getPublicationQueue } from '../lib/queues.js';
import { getSupabase } from '../lib/supabase.js';

const publications = new Hono();

publications.get('/', async (c) => {
  let query = getSupabase()
    .from('publications')
    .select('*, video_jobs(*, affiliated_products(*, product_candidates(nome, imagens))), affiliate_accounts(nome)')
    .order('scheduled_for', { ascending: true })
    .limit(200);
  const status = c.req.query('status');
  const platform = c.req.query('platform');
  const date = c.req.query('date');
  if (status) query = query.eq('status', status);
  if (platform) query = query.eq('publish_platform', platform);
  if (date) {
    query = query.gte('scheduled_for', `${date}T00:00:00.000Z`).lte('scheduled_for', `${date}T23:59:59.999Z`);
  }
  const { data, error } = await query;
  if (error) return c.json({ error: error.message }, 500);
  return c.json({ data });
});

publications.get('/calendar', async (c) => {
  const from = c.req.query('from') ?? new Date().toISOString();
  const to = c.req.query('to') ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await getSupabase()
    .from('publications')
    .select('*, video_jobs(*, affiliated_products(*, product_candidates(nome, imagens))), affiliate_accounts(nome)')
    .gte('scheduled_for', from)
    .lte('scheduled_for', to)
    .order('scheduled_for', { ascending: true });
  if (error) return c.json({ error: error.message }, 500);
  return c.json({ data });
});

publications.get('/:id', async (c) => {
  const { data, error } = await getSupabase().from('publications').select('*').eq('id', c.req.param('id')).single();
  if (error) return c.json({ error: error.message }, 404);
  return c.json({ data });
});

publications.post('/:id/retry', async (c) => {
  await getPublicationQueue().add('publish-single', { publicationId: c.req.param('id') });
  return c.json({ ok: true });
});

export default publications;

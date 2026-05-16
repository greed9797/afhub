import { Hono } from 'hono';
import { getSupabase } from '../lib/supabase.js';
import { processBatchDecision, processDecision } from '../services/approval.js';

const approvals = new Hono();

approvals.get('/', async (c) => {
  const page = Math.max(Number(c.req.query('page') ?? 1), 1);
  const limit = Math.min(Math.max(Number(c.req.query('limit') ?? 50), 1), 100);
  const platform = c.req.query('platform');
  let query = getSupabase()
    .from('product_candidates')
    .select('*, niches(nome)', { count: 'exact' })
    .eq('status', 'pending')
    .order('score', { ascending: false });
  if (platform) query = query.eq('platform', platform);
  const { data, error, count } = await query.range((page - 1) * limit, page * limit - 1);
  if (error) return c.json({ error: error.message }, 500);
  return c.json({ data, meta: { page, limit, total: count ?? 0 } });
});

approvals.post('/:id/approve', async (c) => {
  await processDecision(c.req.param('id'), 'approved', 'web');
  return c.json({ ok: true });
});

approvals.post('/:id/reject', async (c) => {
  await processDecision(c.req.param('id'), 'rejected', 'web');
  return c.json({ ok: true });
});

approvals.post('/batch', async (c) => {
  const body = (await c.req.json()) as { ids?: string[]; decision?: 'approved' | 'rejected' };
  if (!Array.isArray(body.ids) || !body.decision) {
    return c.json({ error: 'ids[] and decision are required.' }, 400);
  }
  const result = await processBatchDecision(body.ids, body.decision);
  return c.json({ ok: result.failed === 0, ...result });
});

export default approvals;

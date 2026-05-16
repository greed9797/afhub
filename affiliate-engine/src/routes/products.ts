import { Hono } from 'hono';
import { getSupabase } from '../lib/supabase.js';

const products = new Hono();

products.get('/candidates', async (c) => {
  const status = c.req.query('status');
  let query = getSupabase().from('product_candidates').select('*, niches(nome)').order('created_at', { ascending: false });
  if (status) query = query.eq('status', status);
  const { data, error } = await query.limit(100);
  if (error) return c.json({ error: error.message }, 500);
  return c.json({ data });
});

products.get('/', async (c) => {
  const { data, error } = await getSupabase()
    .from('affiliated_products')
    .select('*, product_candidates(*), affiliate_accounts(nome, platform)')
    .order('affiliated_at', { ascending: false })
    .limit(100);
  if (error) return c.json({ error: error.message }, 500);
  return c.json({ data });
});

products.get('/:id', async (c) => {
  const { data, error } = await getSupabase()
    .from('affiliated_products')
    .select('*, product_candidates(*), affiliate_accounts(*)')
    .eq('id', c.req.param('id'))
    .single();
  if (error) return c.json({ error: error.message }, 404);
  return c.json({ data });
});

export default products;

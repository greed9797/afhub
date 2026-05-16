import { Hono } from 'hono';
import { getSupabase } from '../lib/supabase.js';

const niches = new Hono();

niches.get('/', async (c) => {
  const { data, error } = await getSupabase().from('niches').select('*').order('created_at', { ascending: false });
  if (error) return c.json({ error: error.message }, 500);
  return c.json({ data });
});

niches.post('/', async (c) => {
  const body = (await c.req.json()) as Record<string, unknown>;
  if (!body.nome || !Array.isArray(body.keywords)) {
    return c.json({ error: 'nome and keywords[] are required.' }, 400);
  }
  const { data, error } = await getSupabase().from('niches').insert(body).select('*').single();
  if (error) return c.json({ error: error.message }, 500);
  return c.json({ data }, 201);
});

niches.patch('/:id', async (c) => {
  const body = (await c.req.json()) as Record<string, unknown>;
  const allowed = ['nome', 'keywords', 'filters', 'active'];
  const patch = Object.fromEntries(Object.entries(body).filter(([key]) => allowed.includes(key)));
  const { data, error } = await getSupabase().from('niches').update(patch).eq('id', c.req.param('id')).select('*').single();
  if (error) return c.json({ error: error.message }, 500);
  return c.json({ data });
});

niches.delete('/:id', async (c) => {
  const { error } = await getSupabase().from('niches').delete().eq('id', c.req.param('id'));
  if (error) return c.json({ error: error.message }, 500);
  return c.json({ ok: true });
});

export default niches;

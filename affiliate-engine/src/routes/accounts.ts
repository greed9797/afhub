import { Hono } from 'hono';
import { getSupabase } from '../lib/supabase.js';
import type { AffiliatePlatform } from '../types.js';
import { exchangeCode, getOAuthUrl, refreshToken } from '../services/oauth.js';

const accounts = new Hono();

accounts.get('/', async (c) => {
  const { data, error } = await getSupabase().from('affiliate_accounts').select('*').order('created_at', { ascending: false });
  if (error) return c.json({ error: error.message }, 500);
  return c.json({ data });
});

accounts.post('/', async (c) => {
  const body = (await c.req.json()) as {
    nome?: string;
    cpf_cnpj?: string;
    platform?: AffiliatePlatform;
    account_type?: string;
    country_code?: string;
  };
  if (!body.nome || !body.cpf_cnpj || !body.platform) {
    return c.json({ error: 'nome, cpf_cnpj and platform are required.' }, 400);
  }
  const { data, error } = await getSupabase()
    .from('affiliate_accounts')
    .insert({
      nome: body.nome,
      cpf_cnpj: body.cpf_cnpj,
      platform: body.platform,
      account_type: body.account_type ?? (body.platform === 'tiktokshop' ? 'creator' : 'affiliate'),
      country_code: body.country_code ?? 'BR',
      api_access_status: 'pending',
      capabilities: { can_scan: false, can_affiliate: false, can_publish: false, can_report: false },
    })
    .select('*')
    .single();
  if (error) return c.json({ error: error.message }, 500);
  return c.json({ data }, 201);
});

accounts.get('/auth/callback', async (c) => {
  const code = c.req.query('code');
  const accountId = c.req.query('state');
  if (!code || !accountId) return c.json({ error: 'Missing OAuth code or state.' }, 400);
  const { data, error } = await getSupabase().from('affiliate_accounts').select('platform').eq('id', accountId).single();
  if (error || !data) return c.json({ error: error?.message ?? 'Account not found.' }, 404);
  await exchangeCode(data.platform as AffiliatePlatform, code, accountId);
  return c.json({ ok: true });
});

accounts.get('/:id', async (c) => {
  const { data, error } = await getSupabase().from('affiliate_accounts').select('*').eq('id', c.req.param('id')).single();
  if (error) return c.json({ error: error.message }, 404);
  return c.json({ data });
});

accounts.patch('/:id', async (c) => {
  const body = (await c.req.json()) as Record<string, unknown>;
  const allowed = ['nome', 'channel_ids', 'status', 'account_type', 'country_code', 'api_access_status', 'capabilities'];
  const patch = Object.fromEntries(Object.entries(body).filter(([key]) => allowed.includes(key)));
  const { data, error } = await getSupabase()
    .from('affiliate_accounts')
    .update(patch)
    .eq('id', c.req.param('id'))
    .select('*')
    .single();
  if (error) return c.json({ error: error.message }, 500);
  return c.json({ data });
});

accounts.delete('/:id', async (c) => {
  const { error } = await getSupabase().from('affiliate_accounts').delete().eq('id', c.req.param('id'));
  if (error) return c.json({ error: error.message }, 500);
  return c.json({ ok: true });
});

accounts.get('/:id/auth/url', async (c) => {
  const { data, error } = await getSupabase().from('affiliate_accounts').select('platform').eq('id', c.req.param('id')).single();
  if (error || !data) return c.json({ error: error?.message ?? 'Account not found.' }, 404);
  return c.json({ data: { url: getOAuthUrl(data.platform as AffiliatePlatform, c.req.param('id')) } });
});

accounts.get('/:id/auth/callback', async (c) => {
  const code = c.req.query('code');
  if (!code) return c.json({ error: 'Missing OAuth code.' }, 400);
  const { data, error } = await getSupabase().from('affiliate_accounts').select('platform').eq('id', c.req.param('id')).single();
  if (error || !data) return c.json({ error: error?.message ?? 'Account not found.' }, 404);
  await exchangeCode(data.platform as AffiliatePlatform, code, c.req.param('id'));
  return c.json({ ok: true });
});

accounts.post('/:id/auth/refresh', async (c) => {
  const { data, error } = await getSupabase().from('affiliate_accounts').select('platform').eq('id', c.req.param('id')).single();
  if (error || !data) return c.json({ error: error?.message ?? 'Account not found.' }, 404);
  await refreshToken(data.platform as AffiliatePlatform, c.req.param('id'));
  return c.json({ ok: true });
});

export default accounts;

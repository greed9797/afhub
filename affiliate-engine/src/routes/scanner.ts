import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import { getSupabase } from '../lib/supabase.js';
import { runScan, type ScanSummary } from '../services/scanner.js';

type ScanJob = { id: string; status: 'running' | 'done' | 'failed'; result?: ScanSummary[]; error?: string; createdAt: string };
const scanJobs = new Map<string, ScanJob>();

const scanner = new Hono();

scanner.post('/run', async (c) => {
  const body = (await c.req.json()) as { nicheIds?: string[] };
  if (!Array.isArray(body.nicheIds) || body.nicheIds.length === 0) {
    return c.json({ error: 'nicheIds[] is required.' }, 400);
  }

  const jobId = randomUUID();
  const job: ScanJob = { id: jobId, status: 'running', createdAt: new Date().toISOString() };
  scanJobs.set(jobId, job);

  void Promise.all(body.nicheIds.map((nicheId) => runScan(nicheId)))
    .then((result) => {
      scanJobs.set(jobId, { ...job, status: 'done', result });
    })
    .catch((error) => {
      scanJobs.set(jobId, { ...job, status: 'failed', error: error instanceof Error ? error.message : 'unknown error' });
    });

  return c.json({ data: job }, 202);
});

scanner.get('/results', async (c) => {
  const page = Math.max(Number(c.req.query('page') ?? 1), 1);
  const limit = Math.min(Math.max(Number(c.req.query('limit') ?? 50), 1), 100);
  const from = (page - 1) * limit;
  const { data, error, count } = await getSupabase()
    .from('product_candidates')
    .select('*, niches(nome)', { count: 'exact' })
    .eq('status', c.req.query('status') ?? 'pending')
    .order('score', { ascending: false })
    .range(from, from + limit - 1);
  if (error) return c.json({ error: error.message }, 500);
  return c.json({ data, meta: { page, limit, total: count ?? 0 } });
});

scanner.get('/status/:jobId', (c) => {
  const job = scanJobs.get(c.req.param('jobId'));
  if (!job) return c.json({ error: 'Scan job not found.' }, 404);
  return c.json({ data: job });
});

export default scanner;

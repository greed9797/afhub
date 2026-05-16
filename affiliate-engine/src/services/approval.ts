import { getAffiliateQueue } from '../lib/queues.js';
import { getSupabase } from '../lib/supabase.js';

export async function processDecision(
  candidateId: string,
  decision: 'approved' | 'rejected',
  source: 'web' | 'telegram',
): Promise<void> {
  const { data: candidate, error: candidateError } = await getSupabase()
    .from('product_candidates')
    .select('id, affiliability_status, commission_source')
    .eq('id', candidateId)
    .single();

  if (candidateError || !candidate) {
    throw candidateError ?? new Error(`Candidate not found: ${candidateId}`);
  }
  if (decision === 'approved' && ['not_affiliable', 'blocked'].includes(String(candidate.affiliability_status ?? ''))) {
    throw new Error(`Candidate ${candidateId} cannot be approved because it is not affiliable.`);
  }
  if (decision === 'approved' && candidate.commission_source === 'estimated') {
    console.warn(`[approval] candidate ${candidateId} uses estimated commission; manual approval source=${source}`);
  }

  const { data, error } = await getSupabase()
    .from('product_candidates')
    .update({
      status: decision,
      reviewed_at: new Date().toISOString(),
      raw_data: undefined,
    })
    .eq('id', candidateId)
    .select('id, status')
    .single();

  if (error || !data) {
    throw error ?? new Error(`Candidate not found: ${candidateId}`);
  }

  if (decision === 'approved') {
    await getAffiliateQueue().add(
      'affiliate-product',
      { candidateId, source },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 60_000 },
      },
    );
  }
}

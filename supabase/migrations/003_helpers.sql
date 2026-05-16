-- Helper functions and indexes for the AfiliadoOS workflow.

CREATE OR REPLACE FUNCTION public.select_least_loaded_account(p_platform text, p_niche_id uuid)
RETURNS public.affiliate_accounts AS $$
  SELECT a.*
  FROM public.affiliate_accounts a
  LEFT JOIN (
    SELECT ap.account_id, COUNT(*) AS cnt
    FROM public.affiliated_products ap
    JOIN public.product_candidates pc ON pc.id = ap.candidate_id
    WHERE pc.niche_id = p_niche_id
    GROUP BY ap.account_id
  ) counts ON counts.account_id = a.id
  WHERE a.platform = p_platform
    AND a.status = 'active'
    AND a.api_access_status = 'approved'
    AND COALESCE((a.capabilities->>'can_affiliate')::boolean, true) = true
  ORDER BY COALESCE(counts.cnt, 0) ASC, a.created_at ASC
  LIMIT 1
$$ LANGUAGE sql STABLE;

ALTER TABLE public.affiliated_products
  DROP CONSTRAINT IF EXISTS affiliated_products_status_check;

ALTER TABLE public.affiliated_products
  ADD CONSTRAINT affiliated_products_status_check
  CHECK (status IN ('active', 'paused', 'expired', 'pending_manual'));

CREATE INDEX IF NOT EXISTS idx_affiliated_products_account ON public.affiliated_products(account_id);
CREATE INDEX IF NOT EXISTS idx_video_jobs_affiliated ON public.video_jobs(affiliated_product_id);
CREATE INDEX IF NOT EXISTS idx_publications_account_platform ON public.publications(account_id, publish_platform);
CREATE INDEX IF NOT EXISTS idx_publications_scheduled_due ON public.publications(scheduled_for) WHERE status = 'scheduled';

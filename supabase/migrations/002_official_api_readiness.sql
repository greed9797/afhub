ALTER TABLE public.affiliate_accounts
  ADD COLUMN IF NOT EXISTS account_type text DEFAULT 'affiliate',
  ADD COLUMN IF NOT EXISTS country_code text DEFAULT 'BR',
  ADD COLUMN IF NOT EXISTS api_access_status text DEFAULT 'missing',
  ADD COLUMN IF NOT EXISTS capabilities jsonb DEFAULT '{"can_scan": false, "can_affiliate": false, "can_publish": false, "can_report": false}';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'affiliate_accounts_account_type_check'
  ) THEN
    ALTER TABLE public.affiliate_accounts
      ADD CONSTRAINT affiliate_accounts_account_type_check
      CHECK (account_type IN ('seller', 'creator', 'affiliate', 'publisher'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'affiliate_accounts_api_access_status_check'
  ) THEN
    ALTER TABLE public.affiliate_accounts
      ADD CONSTRAINT affiliate_accounts_api_access_status_check
      CHECK (api_access_status IN ('missing', 'pending', 'approved', 'revoked', 'failed'));
  END IF;
END $$;

ALTER TABLE public.product_candidates
  ADD COLUMN IF NOT EXISTS source_api text,
  ADD COLUMN IF NOT EXISTS affiliability_status text DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS commission_source text DEFAULT 'unavailable',
  ADD COLUMN IF NOT EXISTS seller_metrics_source text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'product_candidates_affiliability_status_check'
  ) THEN
    ALTER TABLE public.product_candidates
      ADD CONSTRAINT product_candidates_affiliability_status_check
      CHECK (affiliability_status IN ('affiliable', 'not_affiliable', 'unknown', 'blocked'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'product_candidates_commission_source_check'
  ) THEN
    ALTER TABLE public.product_candidates
      ADD CONSTRAINT product_candidates_commission_source_check
      CHECK (commission_source IN ('official', 'estimated', 'unavailable'));
  END IF;
END $$;

ALTER TABLE public.affiliated_products
  ADD COLUMN IF NOT EXISTS link_generation_method text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'affiliated_products_link_generation_method_check'
  ) THEN
    ALTER TABLE public.affiliated_products
      ADD CONSTRAINT affiliated_products_link_generation_method_check
      CHECK (link_generation_method IN ('official_api', 'tracked_url_builder', 'platform_short_link'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_affiliate_accounts_api_access
  ON public.affiliate_accounts(platform, api_access_status);
CREATE INDEX IF NOT EXISTS idx_product_candidates_affiliability
  ON public.product_candidates(affiliability_status);

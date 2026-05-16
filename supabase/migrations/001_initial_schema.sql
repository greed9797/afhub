CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS public.affiliate_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  cpf_cnpj text NOT NULL,
  platform text NOT NULL CHECK (platform IN ('mercadolivre', 'shopee', 'tiktokshop')),
  account_type text DEFAULT 'affiliate' CHECK (account_type IN ('seller', 'creator', 'affiliate', 'publisher')),
  country_code text DEFAULT 'BR',
  api_access_status text DEFAULT 'missing' CHECK (api_access_status IN ('missing', 'pending', 'approved', 'revoked', 'failed')),
  capabilities jsonb DEFAULT '{"can_scan": false, "can_affiliate": false, "can_publish": false, "can_report": false}',
  oauth_tokens_encrypted text,
  channel_ids jsonb DEFAULT '{}',
  status text DEFAULT 'pending_auth' CHECK (status IN ('active', 'suspended', 'pending_auth')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.niches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  keywords text[] NOT NULL,
  filters jsonb DEFAULT '{"comissao_min": 5, "vendas_min": 100, "preco_min": 30, "preco_max": 500, "avaliacao_min": 4.0}',
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.product_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  niche_id uuid REFERENCES public.niches(id) ON DELETE SET NULL,
  platform text NOT NULL,
  product_id text NOT NULL,
  seller_id text,
  nome text NOT NULL,
  descricao text,
  preco decimal(10,2),
  imagens text[] DEFAULT '{}',
  comissao_percent decimal(5,2),
  vendas_mes integer DEFAULT 0,
  avaliacao decimal(3,2),
  score decimal(5,2),
  raw_data jsonb,
  source_api text,
  affiliability_status text DEFAULT 'unknown' CHECK (affiliability_status IN ('affiliable', 'not_affiliable', 'unknown', 'blocked')),
  commission_source text DEFAULT 'unavailable' CHECK (commission_source IN ('official', 'estimated', 'unavailable')),
  seller_metrics_source text,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.affiliated_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid REFERENCES public.affiliate_accounts(id) ON DELETE CASCADE,
  candidate_id uuid REFERENCES public.product_candidates(id) ON DELETE CASCADE,
  affiliate_link text NOT NULL,
  platform text NOT NULL,
  link_generation_method text CHECK (link_generation_method IN ('official_api', 'tracked_url_builder', 'platform_short_link')),
  imagens_storage text[] DEFAULT '{}',
  affiliated_at timestamptz DEFAULT now(),
  status text DEFAULT 'active' CHECK (status IN ('active', 'paused', 'expired'))
);

CREATE TABLE IF NOT EXISTS public.video_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliated_product_id uuid REFERENCES public.affiliated_products(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('product', 'lifestyle')),
  prompt text,
  vertex_operation_name text,
  status text DEFAULT 'queued' CHECK (status IN ('queued', 'generating', 'done', 'failed')),
  video_url text,
  thumbnail_url text,
  retry_count integer DEFAULT 0,
  error_message text,
  created_at timestamptz DEFAULT now(),
  completed_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.publications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_job_id uuid REFERENCES public.video_jobs(id) ON DELETE CASCADE,
  account_id uuid REFERENCES public.affiliate_accounts(id) ON DELETE CASCADE,
  publish_platform text NOT NULL CHECK (publish_platform IN ('tiktok', 'youtube', 'instagram')),
  title text,
  description text,
  hashtags text[] DEFAULT '{}',
  affiliate_link text,
  status text DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'published', 'failed')),
  scheduled_for timestamptz,
  published_at timestamptz,
  external_post_id text,
  error_message text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_product_candidates_status ON public.product_candidates(status);
CREATE INDEX IF NOT EXISTS idx_product_candidates_niche ON public.product_candidates(niche_id);
CREATE INDEX IF NOT EXISTS idx_product_candidates_affiliability ON public.product_candidates(affiliability_status);
CREATE INDEX IF NOT EXISTS idx_affiliate_accounts_api_access ON public.affiliate_accounts(platform, api_access_status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_product_candidates_unique_platform_product_niche
  ON public.product_candidates(platform, product_id, niche_id);
CREATE INDEX IF NOT EXISTS idx_affiliated_products_account ON public.affiliated_products(account_id);
CREATE INDEX IF NOT EXISTS idx_affiliated_products_candidate ON public.affiliated_products(candidate_id);
CREATE INDEX IF NOT EXISTS idx_video_jobs_status ON public.video_jobs(status);
CREATE INDEX IF NOT EXISTS idx_video_jobs_affiliated_product ON public.video_jobs(affiliated_product_id);
CREATE INDEX IF NOT EXISTS idx_publications_status ON public.publications(status);
CREATE INDEX IF NOT EXISTS idx_publications_account ON public.publications(account_id);
CREATE INDEX IF NOT EXISTS idx_publications_scheduled ON public.publications(scheduled_for) WHERE status = 'scheduled';

DROP TRIGGER IF EXISTS set_affiliate_accounts_updated_at ON public.affiliate_accounts;
CREATE TRIGGER set_affiliate_accounts_updated_at
  BEFORE UPDATE ON public.affiliate_accounts
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.affiliate_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.niches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.affiliated_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.video_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.publications ENABLE ROW LEVEL SECURITY;

INSERT INTO storage.buckets (id, name, public)
VALUES
  ('affiliate-products', 'affiliate-products', true),
  ('affiliate-videos', 'affiliate-videos', true)
ON CONFLICT (id) DO NOTHING;

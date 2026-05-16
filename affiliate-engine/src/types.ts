export type AffiliatePlatform = 'mercadolivre' | 'shopee' | 'tiktokshop';
export type PublishPlatform = 'tiktok' | 'youtube' | 'instagram';
export type CandidateStatus = 'pending' | 'approved' | 'rejected';
export type AccountType = 'seller' | 'creator' | 'affiliate' | 'publisher';
export type ApiAccessStatus = 'missing' | 'pending' | 'approved' | 'revoked' | 'failed';
export type VideoJobType = 'product' | 'lifestyle';
export type VideoJobStatus = 'queued' | 'generating' | 'done' | 'failed';
export type AffiliabilityStatus = 'affiliable' | 'not_affiliable' | 'unknown' | 'blocked';
export type CommissionSource = 'official' | 'estimated' | 'unavailable';
export type LinkGenerationMethod = 'official_api' | 'tracked_url_builder' | 'platform_short_link';

export interface AccountCapabilities {
  can_scan?: boolean;
  can_affiliate?: boolean;
  can_publish?: boolean;
  can_report?: boolean;
  [key: string]: unknown;
}

export interface OAuthTokens {
  access_token: string;
  refresh_token?: string;
  expires_at?: number;
  expires_in?: number;
  token_type?: string;
  scope?: string;
  [key: string]: unknown;
}

export interface AffiliateAccount {
  id: string;
  nome: string;
  cpf_cnpj: string;
  platform: AffiliatePlatform;
  account_type?: AccountType | null;
  country_code?: string | null;
  api_access_status?: ApiAccessStatus | null;
  capabilities?: AccountCapabilities | null;
  oauth_tokens_encrypted?: string | null;
  channel_ids?: Record<string, unknown> | null;
  status: 'active' | 'suspended' | 'pending_auth';
}

export interface ProductCandidate {
  id: string;
  niche_id: string | null;
  platform: AffiliatePlatform;
  product_id: string;
  seller_id: string | null;
  nome: string;
  descricao: string | null;
  preco: number | null;
  imagens: string[] | null;
  comissao_percent: number | null;
  vendas_mes: number | null;
  avaliacao: number | null;
  score: number | null;
  raw_data?: Record<string, unknown> | null;
  source_api?: string | null;
  affiliability_status?: AffiliabilityStatus | null;
  commission_source?: CommissionSource | null;
  seller_metrics_source?: string | null;
  status: CandidateStatus;
}

export interface Niche {
  id: string;
  nome: string;
  keywords: string[];
  filters?: Record<string, unknown> | null;
  active: boolean;
}

export interface AffiliatedProduct {
  id: string;
  account_id: string;
  candidate_id: string;
  affiliate_link: string;
  platform: AffiliatePlatform;
  link_generation_method?: LinkGenerationMethod | null;
  imagens_storage: string[] | null;
  status: 'active' | 'paused' | 'expired';
}

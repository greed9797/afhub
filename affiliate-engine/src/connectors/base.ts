import { decrypt } from '../lib/crypto.js';
import { getSupabase } from '../lib/supabase.js';
import type {
  AffiliatePlatform,
  AffiliabilityStatus,
  CommissionSource,
  LinkGenerationMethod,
  OAuthTokens,
} from '../types.js';

export interface RawProduct {
  productId: string;
  sellerId: string;
  nome: string;
  descricao: string;
  preco: number;
  imagens: string[];
  comissaoPercent: number;
  vendasMes: number;
  avaliacao: number;
  productUrl?: string;
  offerUrl?: string;
  shortLink?: string;
  sourceApi?: string;
  affiliabilityStatus?: AffiliabilityStatus;
  commissionSource?: CommissionSource;
  sellerMetricsSource?: string;
  rawData: Record<string, unknown>;
}

export interface SellerMetrics {
  sellerId: string;
  nome: string;
  vendasMes: number;
  avaliacao: number;
  totalProdutos: number;
}

export interface Filters {
  comissaoMin: number;
  vendasMin: number;
  precoMin: number;
  precoMax: number;
  avaliacaoMin: number;
}

export interface AffiliateLinkResult {
  url: string;
  method: LinkGenerationMethod;
  rawData?: Record<string, unknown>;
}

export interface PlatformConnector {
  search(keywords: string[], filters: Filters): Promise<RawProduct[]>;
  getProductDetails(productId: string): Promise<RawProduct>;
  getSellerMetrics(sellerId: string): Promise<SellerMetrics>;
  affiliate(accountId: string, productId: string): Promise<AffiliateLinkResult>;
  generateAffiliateLink(accountId: string, productId: string): Promise<AffiliateLinkResult>;
}

export class ConnectorAccessError extends Error {
  constructor(
    message: string,
    public readonly platform: AffiliatePlatform,
    public readonly apiAccessStatus: 'missing' | 'pending' | 'approved' | 'revoked' | 'failed',
  ) {
    super(message);
    this.name = 'ConnectorAccessError';
  }
}

export function defaultFilters(input?: Record<string, unknown> | null): Filters {
  return {
    comissaoMin: Number(input?.comissao_min ?? input?.comissaoMin ?? 5),
    vendasMin: Number(input?.vendas_min ?? input?.vendasMin ?? 100),
    precoMin: Number(input?.preco_min ?? input?.precoMin ?? 30),
    precoMax: Number(input?.preco_max ?? input?.precoMax ?? 500),
    avaliacaoMin: Number(input?.avaliacao_min ?? input?.avaliacaoMin ?? 4),
  };
}

export async function withRetry<T>(operation: () => Promise<T>, label: string, attempts = 3): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt === attempts) break;
      await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** (attempt - 1)));
    }
  }
  throw new Error(`${label} failed after ${attempts} attempts: ${lastError instanceof Error ? lastError.message : 'unknown error'}`);
}

export async function fetchJson<T>(url: string, init: RequestInit, label: string): Promise<T> {
  const response = await fetch(url, init);
  const text = await response.text();
  const json = text ? JSON.parse(text) : {};

  if (!response.ok) {
    const message = typeof json?.message === 'string' ? json.message : text.slice(0, 300);
    throw new Error(`${label} returned ${response.status}: ${message}`);
  }

  return json as T;
}

export async function loadAccountTokens(accountId: string, expectedPlatform?: AffiliatePlatform): Promise<OAuthTokens> {
  const { data, error } = await getSupabase()
    .from('affiliate_accounts')
    .select('id, platform, oauth_tokens_encrypted, status')
    .eq('id', accountId)
    .single();

  if (error || !data) {
    throw new Error(`Affiliate account not found: ${accountId}`);
  }
  if (expectedPlatform && data.platform !== expectedPlatform) {
    throw new Error(`Account ${accountId} is not a ${expectedPlatform} account.`);
  }
  if (!data.oauth_tokens_encrypted) {
    throw new Error(`Account ${accountId} has no OAuth tokens.`);
  }

  return JSON.parse(decrypt(data.oauth_tokens_encrypted)) as OAuthTokens;
}

export async function loadFirstPlatformTokens(platform: AffiliatePlatform): Promise<OAuthTokens | null> {
  const { data, error } = await getSupabase()
    .from('affiliate_accounts')
    .select('oauth_tokens_encrypted')
    .eq('platform', platform)
    .eq('status', 'active')
    .eq('api_access_status', 'approved')
    .limit(1)
    .maybeSingle();

  if (error || !data?.oauth_tokens_encrypted) return null;
  return JSON.parse(decrypt(data.oauth_tokens_encrypted)) as OAuthTokens;
}

import { requireEnv } from '../lib/env.js';
import type { AffiliatePlatform } from '../types.js';
import {
  ConnectorAccessError,
  fetchJson,
  loadAccountTokens,
  type AffiliateLinkResult,
  type Filters,
  type PlatformConnector,
  type RawProduct,
  type SellerMetrics,
  withRetry,
} from './base.js';

type MercadoLivreSearchItem = {
  id: string;
  title?: string;
  price?: number;
  thumbnail?: string;
  pictures?: Array<{ url?: string; secure_url?: string }>;
  seller?: { id?: number | string; nickname?: string };
  seller_address?: unknown;
  sold_quantity?: number;
  available_quantity?: number;
  attributes?: unknown[];
};

type MercadoLivreSearchResponse = {
  results?: MercadoLivreSearchItem[];
};

const platform: AffiliatePlatform = 'mercadolivre';

export class MercadoLivreConnector implements PlatformConnector {
  async search(keywords: string[], filters: Filters): Promise<RawProduct[]> {
    const query = encodeURIComponent(keywords.join(' '));
    const url = `https://api.mercadolibre.com/sites/MLB/search?q=${query}&limit=50`;

    return withRetry(async () => {
      const data = await fetchJson<MercadoLivreSearchResponse>(url, { method: 'GET' }, 'Mercado Livre search');
      return (data.results ?? [])
        .map((item) => this.mapSearchItem(item))
        .filter((product) => this.passesFilters(product, filters));
    }, 'Mercado Livre search');
  }

  async getProductDetails(productId: string): Promise<RawProduct> {
    const item = await fetchJson<Record<string, unknown>>(
      `https://api.mercadolibre.com/items/${encodeURIComponent(productId)}`,
      { method: 'GET' },
      'Mercado Livre product details',
    );

    return this.mapSearchItem({
      id: String(item.id ?? productId),
      title: String(item.title ?? ''),
      price: Number(item.price ?? 0),
      pictures: Array.isArray(item.pictures) ? (item.pictures as Array<{ url?: string; secure_url?: string }>) : [],
      seller: typeof item.seller_id !== 'undefined' ? { id: String(item.seller_id) } : undefined,
      sold_quantity: Number(item.sold_quantity ?? 0),
    });
  }

  async getSellerMetrics(sellerId: string): Promise<SellerMetrics> {
    const seller = await fetchJson<Record<string, unknown>>(
      `https://api.mercadolibre.com/users/${encodeURIComponent(sellerId)}`,
      { method: 'GET' },
      'Mercado Livre seller metrics',
    );

    const reputation = seller.seller_reputation as Record<string, unknown> | undefined;
    return {
      sellerId,
      nome: String(seller.nickname ?? sellerId),
      vendasMes: Number(reputation?.transactions ? (reputation.transactions as Record<string, unknown>).completed ?? 0 : 0),
      avaliacao: Number(reputation?.level_id ? 4.5 : 4),
      totalProdutos: 0,
    };
  }

  async affiliate(accountId: string, productId: string): Promise<AffiliateLinkResult> {
    return this.generateAffiliateLink(accountId, productId);
  }

  async generateAffiliateLink(accountId: string, productId: string): Promise<AffiliateLinkResult> {
    const tokens = await loadAccountTokens(accountId, platform);
    const officialEndpoint = process.env.ML_AFFILIATE_LINK_API_URL;
    if (officialEndpoint) {
      const data = await withRetry(
        () =>
          fetchJson<Record<string, unknown>>(
            officialEndpoint,
            {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${tokens.access_token}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ item_id: productId }),
            },
            'Mercado Livre official affiliate link',
          ),
        'Mercado Livre official affiliate link',
      );

      const link = data.link ?? data.short_url ?? data.url;
      if (!link) {
        throw new Error('Mercado Livre affiliate link response did not include a link.');
      }
      return { url: String(link), method: 'official_api', rawData: data };
    }

    const template = process.env.ML_TRACKED_URL_TEMPLATE;
    const affiliateTag = process.env.ML_AFFILIATE_TAG;
    if (template && affiliateTag) {
      return {
        url: template
          .replaceAll('{productId}', encodeURIComponent(productId))
          .replaceAll('{affiliateTag}', encodeURIComponent(affiliateTag)),
        method: 'tracked_url_builder',
      };
    }

    throw new ConnectorAccessError(
      'Mercado Livre affiliate link generation needs an approved official API endpoint or an allowed tracked URL template.',
      platform,
      'pending',
    );
  }

  private mapSearchItem(item: MercadoLivreSearchItem): RawProduct {
    const images = [
      ...(item.pictures ?? []).map((picture) => picture.secure_url || picture.url).filter(Boolean),
      item.thumbnail,
    ].filter(Boolean) as string[];

    return {
      productId: item.id,
      sellerId: String(item.seller?.id ?? ''),
      nome: item.title ?? item.id,
      descricao: item.title ?? '',
      preco: Number(item.price ?? 0),
      imagens: [...new Set(images)],
      comissaoPercent: Number(process.env.ML_DEFAULT_COMMISSION_PERCENT ?? 5),
      vendasMes: Number(item.sold_quantity ?? 0),
      avaliacao: 4.5,
      productUrl: `https://www.mercadolivre.com.br/p/${item.id}`,
      sourceApi: 'mercadolivre_items_search',
      affiliabilityStatus: 'unknown',
      commissionSource: 'estimated',
      sellerMetricsSource: 'mercadolivre_search',
      rawData: {
        ...item,
        comissao_estimada: true,
      },
    };
  }

  private passesFilters(product: RawProduct, filters: Filters): boolean {
    return (
      product.comissaoPercent >= filters.comissaoMin &&
      product.vendasMes >= filters.vendasMin &&
      product.preco >= filters.precoMin &&
      product.preco <= filters.precoMax &&
      product.avaliacao >= filters.avaliacaoMin
    );
  }
}

export function mercadoLivreOAuthUrl(accountId: string): string {
  return buildMercadoLivreOAuthUrl({
    appId: requireEnv('ML_APP_ID'),
    redirectUri: requireEnv('ML_REDIRECT_URI'),
    accountId,
    codeChallenge: process.env.ML_PKCE_CODE_CHALLENGE,
  });
}

export function buildMercadoLivreOAuthUrl(params: {
  appId: string;
  redirectUri: string;
  accountId: string;
  codeChallenge?: string;
}): string {
  const searchParams = new URLSearchParams({
    response_type: 'code',
    client_id: params.appId,
    redirect_uri: params.redirectUri,
    state: params.accountId,
  });
  if (params.codeChallenge) {
    searchParams.set('code_challenge', params.codeChallenge);
    searchParams.set('code_challenge_method', 'S256');
  }
  return `https://auth.mercadolivre.com.br/authorization?${searchParams.toString()}`;
}

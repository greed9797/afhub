import { createHmac } from 'node:crypto';
import { requireEnv } from '../lib/env.js';
import type { AffiliatePlatform } from '../types.js';
import {
  ConnectorAccessError,
  fetchJson,
  loadAccountTokens,
  loadFirstPlatformTokens,
  type AffiliateLinkResult,
  type Filters,
  type PlatformConnector,
  type RawProduct,
  type SellerMetrics,
  withRetry,
} from './base.js';

const platform: AffiliatePlatform = 'tiktokshop';
const baseUrl = 'https://open-api.tiktokglobalshop.com';

type TikTokProduct = Record<string, unknown>;

export function buildTikTokShopSignature(params: {
  appSecret: string;
  path: string;
  query: Record<string, string | number | undefined>;
  body?: string;
}): string {
  const canonicalQuery = Object.entries(params.query)
    .filter(([key, value]) => key !== 'sign' && value !== undefined)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}${String(value)}`)
    .join('');
  return createHmac('sha256', params.appSecret)
    .update(`${params.appSecret}${params.path}${canonicalQuery}${params.body ?? ''}${params.appSecret}`)
    .digest('hex');
}

export class TikTokShopCommerceConnector implements PlatformConnector {
  async search(keywords: string[], filters: Filters): Promise<RawProduct[]> {
    const path = process.env.TIKTOK_SHOP_PRODUCT_SEARCH_PATH;
    if (!path) {
      throw new ConnectorAccessError('TIKTOK_SHOP_PRODUCT_SEARCH_PATH is not configured for product search.', platform, 'missing');
    }
    const body = JSON.stringify({ keyword: keywords.join(' '), page_size: 50 });
    const token = process.env.TIKTOK_SHOP_ACCESS_TOKEN ?? (await loadFirstPlatformTokens(platform))?.access_token;
    if (!token) {
      throw new ConnectorAccessError('TikTok Shop scan needs an approved merchant/creator OAuth token.', platform, 'pending');
    }

    return withRetry(async () => {
      const data = await signedTikTokRequest<Record<string, unknown>>(path, {
        method: 'POST',
        accessToken: token,
        body,
        label: 'TikTok Shop product search',
      });
      const list = ((data.data as Record<string, unknown> | undefined)?.products ?? data.products ?? []) as TikTokProduct[];
      return list.map((item) => this.mapProduct(item, 'tiktok_shop_product_search')).filter((product) => this.passesFilters(product, filters));
    }, 'TikTok Shop product search');
  }

  async getProductDetails(productId: string): Promise<RawProduct> {
    const path = `/product/202309/products/${encodeURIComponent(productId)}`;
    const token = process.env.TIKTOK_SHOP_ACCESS_TOKEN ?? (await loadFirstPlatformTokens(platform))?.access_token;
    if (!token) {
      throw new ConnectorAccessError('TikTok Shop product details need an approved merchant/creator OAuth token.', platform, 'pending');
    }
    const data = await signedTikTokRequest<Record<string, unknown>>(path, {
      method: 'GET',
      accessToken: token,
      label: 'TikTok Shop product details',
    });
    return this.mapProduct((data.data as TikTokProduct | undefined) ?? data, 'tiktok_shop_product_details');
  }

  async getSellerMetrics(sellerId: string): Promise<SellerMetrics> {
    return {
      sellerId,
      nome: sellerId,
      vendasMes: 0,
      avaliacao: 4,
      totalProdutos: 0,
    };
  }

  async affiliate(accountId: string, productId: string): Promise<AffiliateLinkResult> {
    return this.generateAffiliateLink(accountId, productId);
  }

  async generateAffiliateLink(_accountId: string, _productId: string): Promise<AffiliateLinkResult> {
    throw new ConnectorAccessError(
      'TikTok Shop affiliate link generation is blocked until an approved affiliate link endpoint is configured.',
      platform,
      'pending',
    );
  }

  protected mapProduct(item: TikTokProduct, sourceApi: string): RawProduct {
    const imagesRaw = item.images ?? item.main_images ?? [];
    const images = Array.isArray(imagesRaw)
      ? imagesRaw.map((image) => (typeof image === 'string' ? image : String((image as Record<string, unknown>).url ?? ''))).filter(Boolean)
      : [];
    const priceRaw = item.price ?? (item.sale_price as Record<string, unknown> | undefined)?.amount ?? 0;
    const commission = Number(item.commission_rate ?? item.commission_percent ?? 0);

    return {
      productId: String(item.id ?? item.product_id ?? ''),
      sellerId: String(item.seller_id ?? item.shop_id ?? ''),
      nome: String(item.title ?? item.name ?? item.product_name ?? ''),
      descricao: String(item.description ?? item.title ?? ''),
      preco: Number(priceRaw),
      imagens: images,
      comissaoPercent: commission,
      vendasMes: Number(item.sales_count ?? item.sold_count ?? 0),
      avaliacao: Number(item.rating ?? item.review_rating ?? 4.2),
      productUrl: String(item.product_url ?? item.detail_url ?? ''),
      offerUrl: String(item.affiliate_url ?? item.open_collaboration_url ?? ''),
      sourceApi,
      affiliabilityStatus: commission > 0 ? 'affiliable' : 'unknown',
      commissionSource: commission > 0 ? 'official' : 'unavailable',
      sellerMetricsSource: 'tiktok_shop_api',
      rawData: item,
    };
  }

  protected passesFilters(product: RawProduct, filters: Filters): boolean {
    return (
      product.comissaoPercent >= filters.comissaoMin &&
      product.vendasMes >= filters.vendasMin &&
      product.preco >= filters.precoMin &&
      product.preco <= filters.precoMax &&
      product.avaliacao >= filters.avaliacaoMin
    );
  }
}

export class TikTokShopAffiliateConnector extends TikTokShopCommerceConnector {
  override async search(keywords: string[], filters: Filters): Promise<RawProduct[]> {
    const path = process.env.TIKTOK_SHOP_AFFILIATE_PRODUCT_SEARCH_PATH;
    if (!path) return super.search(keywords, filters);
    const body = JSON.stringify({ keyword: keywords.join(' '), page_size: 50 });
    const token = process.env.TIKTOK_SHOP_ACCESS_TOKEN ?? (await loadFirstPlatformTokens(platform))?.access_token;
    if (!token) {
      throw new ConnectorAccessError('TikTok Shop affiliate scan needs an approved creator OAuth token.', platform, 'pending');
    }
    const data = await signedTikTokRequest<Record<string, unknown>>(path, {
      method: 'POST',
      accessToken: token,
      body,
      label: 'TikTok Shop affiliate product search',
    });
    const list = ((data.data as Record<string, unknown> | undefined)?.products ?? data.products ?? []) as TikTokProduct[];
    return list
      .map((item) => this.mapProduct(item, 'tiktok_shop_affiliate_product_search'))
      .filter((product) => this.passesFilters(product, filters));
  }

  override async generateAffiliateLink(accountId: string, productId: string): Promise<AffiliateLinkResult> {
    const path = process.env.TIKTOK_SHOP_AFFILIATE_LINK_PATH;
    if (!path) {
      throw new ConnectorAccessError(
        'TikTok Shop affiliate link endpoint is not configured for this approved app/account.',
        platform,
        'pending',
      );
    }
    const tokens = await loadAccountTokens(accountId, platform);
    const body = JSON.stringify({ product_id: productId });
    const data = await signedTikTokRequest<Record<string, unknown>>(path, {
      method: 'POST',
      accessToken: tokens.access_token,
      body,
      label: 'TikTok Shop affiliate link',
    });

    const response = data.data as Record<string, unknown> | undefined;
    const link = response?.affiliate_link ?? response?.short_link ?? data.affiliate_link ?? data.short_link;
    if (!link) {
      throw new Error('TikTok Shop affiliate link response did not include a link.');
    }
    return { url: String(link), method: 'official_api', rawData: data };
  }
}

export class TikTokShopConnector extends TikTokShopAffiliateConnector {}

async function signedTikTokRequest<T>(path: string, params: {
  method: 'GET' | 'POST';
  body?: string;
  accessToken?: string;
  label: string;
}): Promise<T> {
  if (!process.env.TIKTOK_SHOP_APP_KEY || !process.env.TIKTOK_SHOP_APP_SECRET) {
    throw new ConnectorAccessError('TikTok Shop app credentials are missing or pending approval.', platform, 'missing');
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const query: Record<string, string | number | undefined> = {
    app_key: requireEnv('TIKTOK_SHOP_APP_KEY'),
    timestamp,
  };
  if (process.env.TIKTOK_SHOP_CIPHER) query.shop_cipher = process.env.TIKTOK_SHOP_CIPHER;
  query.sign = buildTikTokShopSignature({
    appSecret: requireEnv('TIKTOK_SHOP_APP_SECRET'),
    path,
    query,
    body: params.body,
  });

  const url = new URL(`${baseUrl}${path}`);
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined) url.searchParams.set(key, String(value));
  });

  return fetchJson<T>(
    url.toString(),
    {
      method: params.method,
      headers: {
        'Content-Type': 'application/json',
        ...(params.accessToken ? { 'x-tts-access-token': params.accessToken } : {}),
      },
      body: params.body,
    },
    params.label,
  );
}

export function tiktokShopOAuthUrl(accountId: string): string {
  const params = new URLSearchParams({
    app_key: requireEnv('TIKTOK_SHOP_APP_KEY'),
    redirect_uri: requireEnv('TIKTOK_REDIRECT_URI'),
    state: accountId,
    response_type: 'code',
  });
  return `${process.env.TIKTOK_AUTH_URL ?? 'https://services.tiktokshop.com/open/authorize'}?${params.toString()}`;
}

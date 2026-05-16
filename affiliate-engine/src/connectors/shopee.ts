import { createHash } from 'node:crypto';
import { requireEnv } from '../lib/env.js';
import type { AffiliatePlatform } from '../types.js';
import {
  ConnectorAccessError,
  fetchJson,
  type AffiliateLinkResult,
  type Filters,
  type PlatformConnector,
  type RawProduct,
  type SellerMetrics,
  withRetry,
} from './base.js';

const platform: AffiliatePlatform = 'shopee';
const defaultGraphqlUrl = 'https://open-api.affiliate.shopee.com.br/graphql';

type ShopeeOffer = Record<string, unknown>;

export function buildShopeeAffiliateAuthorization(params: {
  appId: string;
  secret: string;
  timestamp: number;
  payload: string;
}): string {
  const signature = createHash('sha256')
    .update(`${params.appId}${params.timestamp}${params.payload}${params.secret}`)
    .digest('hex');
  return `SHA256 Credential=${params.appId}, Timestamp=${params.timestamp}, Signature=${signature}`;
}

export class ShopeeConnector implements PlatformConnector {
  async search(keywords: string[], filters: Filters): Promise<RawProduct[]> {
    this.assertAffiliateApiConfigured();
    const payload = JSON.stringify({
      query: `
        query ProductOffer($keyword: String!, $limit: Int!) {
          productOfferV2(keyword: $keyword, limit: $limit) {
            nodes {
              productId shopId productName productLink offerLink imageUrl priceMin priceMax
              commissionRate sales ratingStar
            }
          }
        }
      `,
      variables: {
        keyword: keywords.join(' '),
        limit: 50,
      },
    });

    return withRetry(async () => {
      const data = await this.graphql(payload, 'Shopee Affiliate productOfferV2');
      const offers = readShopeeList(data, ['productOfferV2', 'nodes']);
      return offers.map((item) => this.mapOffer(item)).filter((product) => this.passesFilters(product, filters));
    }, 'Shopee Affiliate productOfferV2');
  }

  async getProductDetails(productId: string): Promise<RawProduct> {
    const [itemId] = productId.split(':');
    const products = await this.search([itemId], {
      comissaoMin: 0,
      vendasMin: 0,
      precoMin: 0,
      precoMax: Number.MAX_SAFE_INTEGER,
      avaliacaoMin: 0,
    });
    return products.find((product) => product.productId === productId || product.productId.startsWith(`${itemId}:`)) ?? {
      productId,
      sellerId: '',
      nome: productId,
      descricao: '',
      preco: 0,
      imagens: [],
      comissaoPercent: 0,
      vendasMes: 0,
      avaliacao: 0,
      sourceApi: 'shopee_affiliate_productOfferV2',
      affiliabilityStatus: 'unknown',
      commissionSource: 'unavailable',
      rawData: {},
    };
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

  async generateAffiliateLink(_accountId: string, productId: string): Promise<AffiliateLinkResult> {
    this.assertAffiliateApiConfigured();
    const [, shopId] = productId.split(':');
    const originUrl = shopId
      ? `https://shopee.com.br/product/${shopId}/${productId.split(':')[0]}`
      : `https://shopee.com.br/search?keyword=${encodeURIComponent(productId)}`;
    const subIds = (process.env.SHOPEE_AFFILIATE_SUB_IDS ?? '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 5);
    const payload = JSON.stringify({
      query: `
        mutation GenerateShortLink($originUrl: String!, $subIds: [String!]) {
          generateShortLink(originUrl: $originUrl, subIds: $subIds) {
            shortLink
          }
        }
      `,
      variables: {
        originUrl,
        subIds,
      },
    });

    const data = await withRetry(
      () => this.graphql(payload, 'Shopee Affiliate generateShortLink'),
      'Shopee Affiliate generateShortLink',
    );
    const response = data.data as Record<string, unknown> | undefined;
    const mutation = response?.generateShortLink as Record<string, unknown> | undefined;
    const shortLink = mutation?.shortLink ?? mutation?.short_link ?? data.shortLink ?? data.short_link;
    if (!shortLink) {
      throw new Error('Shopee Affiliate generateShortLink response did not include a short link.');
    }
    return { url: String(shortLink), method: 'platform_short_link', rawData: data };
  }

  private async graphql(payload: string, label: string): Promise<Record<string, unknown>> {
    const timestamp = Math.floor(Date.now() / 1000);
    const appId = requireEnv('SHOPEE_AFFILIATE_APP_ID');
    const secret = requireEnv('SHOPEE_AFFILIATE_SECRET');
    const data = await fetchJson<Record<string, unknown>>(
      process.env.SHOPEE_AFFILIATE_GRAPHQL_URL ?? defaultGraphqlUrl,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: buildShopeeAffiliateAuthorization({ appId, secret, timestamp, payload }),
        },
        body: payload,
      },
      label,
    );
    const errors = data.errors;
    if (Array.isArray(errors) && errors.length > 0) {
      const message = JSON.stringify(errors).slice(0, 500);
      const hashInput = createHash('sha256').update(`${appId}${timestamp}${payload}`).digest('hex');
      if (/invalid signature/i.test(message)) {
        throw new ConnectorAccessError(`Shopee Affiliate invalid signature. payload_hash=${hashInput}`, platform, 'failed');
      }
      throw new Error(`${label} GraphQL errors: ${message}`);
    }
    return data;
  }

  private assertAffiliateApiConfigured(): void {
    if (!process.env.SHOPEE_AFFILIATE_APP_ID || !process.env.SHOPEE_AFFILIATE_SECRET) {
      throw new ConnectorAccessError('Shopee Affiliate API credentials are missing or pending approval.', platform, 'missing');
    }
  }

  private mapOffer(item: ShopeeOffer): RawProduct {
    const itemId = String(item.productId ?? item.itemId ?? item.item_id ?? '');
    const shopId = String(item.shopId ?? item.shop_id ?? '');
    const productLink = String(item.productLink ?? item.product_link ?? '');
    const offerLink = String(item.offerLink ?? item.offer_link ?? '');
    const commissionRate = Number(item.commissionRate ?? item.commission_rate ?? item.commissionPercent ?? 0);
    const imageUrl = item.imageUrl ?? item.image_url;

    return {
      productId: shopId ? `${itemId}:${shopId}` : itemId,
      sellerId: shopId,
      nome: String(item.productName ?? item.product_name ?? item.name ?? itemId),
      descricao: String(item.description ?? item.productName ?? item.product_name ?? ''),
      preco: Number(item.priceMin ?? item.price ?? item.price_min ?? 0),
      imagens: [imageUrl].filter(Boolean).map(String),
      comissaoPercent: commissionRate,
      vendasMes: Number(item.sales ?? item.salesMonth ?? item.sales_month ?? 0),
      avaliacao: Number(item.ratingStar ?? item.rating_star ?? item.rating ?? 4.2),
      productUrl: productLink,
      offerUrl: offerLink,
      sourceApi: 'shopee_affiliate_productOfferV2',
      affiliabilityStatus: commissionRate > 0 && (offerLink || productLink) ? 'affiliable' : 'not_affiliable',
      commissionSource: commissionRate > 0 ? 'official' : 'unavailable',
      sellerMetricsSource: 'shopee_affiliate_offer',
      rawData: item,
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

function readShopeeList(data: Record<string, unknown>, path: string[]): ShopeeOffer[] {
  const root = (data.data ?? data) as Record<string, unknown>;
  let current: unknown = root;
  for (const key of path) {
    current = (current as Record<string, unknown> | undefined)?.[key];
  }
  if (Array.isArray(current)) return current as ShopeeOffer[];
  const fallback = (root.productOfferV2 as Record<string, unknown> | undefined)?.items
    ?? (root.productOfferV2 as Record<string, unknown> | undefined)?.list
    ?? root.products;
  return Array.isArray(fallback) ? (fallback as ShopeeOffer[]) : [];
}

export function shopeeOAuthUrl(accountId: string): string {
  const redirectUri = process.env.SHOPEE_REDIRECT_URI;
  if (!redirectUri) {
    return `https://affiliate.shopee.com.br?state=${encodeURIComponent(accountId)}`;
  }
  const params = new URLSearchParams({ state: accountId, redirect_uri: redirectUri });
  return `${process.env.SHOPEE_AFFILIATE_AUTH_URL ?? 'https://affiliate.shopee.com.br/open_api/authorize'}?${params.toString()}`;
}

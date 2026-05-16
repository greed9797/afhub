import { NextResponse } from 'next/server';

const envKeys = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'GOOGLE_CLOUD_PROJECT',
  'GOOGLE_CLOUD_LOCATION',
  'GOOGLE_SERVICE_ACCOUNT_JSON',
  'GOOGLE_AI_API_KEY',
  'ML_APP_ID',
  'ML_CLIENT_SECRET',
  'ML_REDIRECT_URI',
  'ML_AFFILIATE_LINK_API_URL',
  'ML_TRACKED_URL_TEMPLATE',
  'ML_AFFILIATE_TAG',
  'SHOPEE_AFFILIATE_APP_ID',
  'SHOPEE_AFFILIATE_SECRET',
  'SHOPEE_AFFILIATE_GRAPHQL_URL',
  'SHOPEE_REDIRECT_URI',
  'TIKTOK_SHOP_APP_KEY',
  'TIKTOK_SHOP_APP_SECRET',
  'TIKTOK_SHOP_PRODUCT_SEARCH_PATH',
  'TIKTOK_SHOP_AFFILIATE_LINK_PATH',
  'TIKTOK_REDIRECT_URI',
  'TELEGRAM_BOT_TOKEN',
  'TELEGRAM_CHAT_ID',
  'TELEGRAM_WEBHOOK_SECRET',
  'UPSTASH_REDIS_URL',
  'INTERNAL_API_KEY',
  'ENCRYPTION_KEY',
];

function shouldMock() {
  return process.env.NODE_ENV !== 'production' && process.env.AFFILIATE_ENGINE_MOCK !== 'false';
}

function listResponse() {
  return NextResponse.json({ data: [], meta: { page: 1, limit: 50, total: 0 }, mock: true });
}

function devFallback(path, method) {
  if (!shouldMock()) return null;

  if (method !== 'GET') return NextResponse.json({ ok: true, data: null, mock: true });

  if (path === 'settings/env') {
    return NextResponse.json({
      data: envKeys.map((key) => ({ key, configured: Boolean(process.env[key]) })),
      mock: true,
    });
  }

  if (path === 'settings/readiness') {
    return NextResponse.json({
      data: [
        {
          platform: 'shopee',
          country_code: 'BR',
          api_access_status: process.env.SHOPEE_AFFILIATE_APP_ID ? 'approved' : 'missing',
          capabilities: {
            can_scan: Boolean(process.env.SHOPEE_AFFILIATE_APP_ID),
            can_affiliate: Boolean(process.env.SHOPEE_AFFILIATE_SECRET),
            can_report: Boolean(process.env.SHOPEE_AFFILIATE_SECRET),
          },
          required_env: ['SHOPEE_AFFILIATE_APP_ID', 'SHOPEE_AFFILIATE_SECRET'],
        },
        {
          platform: 'tiktokshop',
          country_code: process.env.TIKTOK_SHOP_REGION ?? 'BR',
          api_access_status: process.env.TIKTOK_SHOP_APP_KEY ? 'pending' : 'missing',
          capabilities: {
            can_scan: Boolean(process.env.TIKTOK_SHOP_PRODUCT_SEARCH_PATH),
            can_affiliate: Boolean(process.env.TIKTOK_SHOP_AFFILIATE_LINK_PATH),
            can_publish: Boolean(process.env.TIKTOK_CLIENT_KEY || process.env.TIKTOK_CONTENT_APP_KEY),
          },
          required_env: ['TIKTOK_SHOP_APP_KEY', 'TIKTOK_SHOP_APP_SECRET', 'TIKTOK_SHOP_AFFILIATE_LINK_PATH'],
        },
        {
          platform: 'mercadolivre',
          country_code: 'BR',
          api_access_status: process.env.ML_APP_ID ? 'pending' : 'missing',
          capabilities: {
            can_scan: Boolean(process.env.ML_APP_ID),
            can_affiliate: Boolean(process.env.ML_AFFILIATE_LINK_API_URL || process.env.ML_TRACKED_URL_TEMPLATE),
          },
          required_env: ['ML_APP_ID', 'ML_CLIENT_SECRET', 'ML_REDIRECT_URI', 'ML_AFFILIATE_LINK_API_URL or tracked URL'],
        },
      ],
      mock: true,
    });
  }

  if (path.startsWith('scanner/status/')) {
    return NextResponse.json({
      data: { id: path.split('/').pop(), status: 'failed', error: 'Affiliate engine is offline.' },
      mock: true,
    });
  }

  if (
    path === 'accounts' ||
    path === 'niches' ||
    path === 'products' ||
    path === 'videos' ||
    path === 'publications' ||
    path === 'approvals' ||
    path === 'scanner/results' ||
    path === 'analytics/summary' ||
    path === 'analytics/events' ||
    path === 'analytics/import'
  ) {
    if (path === 'analytics/summary') {
      return NextResponse.json({
        totals: {
          impressions: 0,
          clicks: 0,
          orders: 0,
          gmv: 0,
          commission: 0,
          ctr: 0,
          conversionRate: 0,
          averageOrderValue: 0,
          epc: 0,
        },
        byAccount: [],
        byDay: [],
        topProducts: [],
        mock: true,
      });
    }
    return listResponse();
  }

  return null;
}

async function proxy(request, { params }) {
  const pathSegments = (await params).path || [];
  const path = pathSegments.join('/');
  const upstream = new URL(`/api/${path}`, process.env.AFFILIATE_ENGINE_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001');
  upstream.search = request.nextUrl.search;

  const headers = new Headers(request.headers);
  headers.delete('host');
  headers.delete('cookie');
  headers.set('authorization', `Bearer ${process.env.INTERNAL_API_KEY ?? ''}`);

  let response;
  try {
    response = await fetch(upstream, {
      method: request.method,
      headers,
      body: ['GET', 'HEAD'].includes(request.method) ? undefined : await request.text(),
      cache: 'no-store',
    });
  } catch (error) {
    const fallback = devFallback(path, request.method);
    if (fallback) return fallback;
    return NextResponse.json(
      {
        error: 'Affiliate engine is offline. Start affiliate-engine on PORT 3001.',
        detail: error instanceof Error ? error.message : 'unknown upstream error',
      },
      { status: 502 },
    );
  }

  if (response.status === 404 || response.status >= 500) {
    const fallback = devFallback(path, request.method);
    if (fallback) return fallback;
  }

  const responseHeaders = new Headers(response.headers);
  responseHeaders.delete('content-encoding');
  responseHeaders.delete('transfer-encoding');

  return new NextResponse(response.body, {
    status: response.status,
    headers: responseHeaders,
  });
}

export const GET = proxy;
export const POST = proxy;
export const PATCH = proxy;
export const DELETE = proxy;

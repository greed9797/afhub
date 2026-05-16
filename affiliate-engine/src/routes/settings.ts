import { Hono } from 'hono';
import { sendScanSummary } from '../services/telegram.js';

const settings = new Hono();

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
  'TIKTOK_SHOP_AFFILIATE_PRODUCT_SEARCH_PATH',
  'TIKTOK_SHOP_AFFILIATE_LINK_PATH',
  'TIKTOK_REDIRECT_URI',
  'TELEGRAM_BOT_TOKEN',
  'TELEGRAM_CHAT_ID',
  'TELEGRAM_WEBHOOK_SECRET',
  'UPSTASH_REDIS_URL',
  'INTERNAL_API_KEY',
  'ENCRYPTION_KEY',
];

settings.get('/env', (c) => {
  return c.json({
    data: envKeys.map((key) => ({
      key,
      configured: Boolean(process.env[key]),
    })),
  });
});

settings.get('/readiness', (c) => {
  const readiness = [
    {
      platform: 'shopee',
      country_code: 'BR',
      api_access_status: process.env.SHOPEE_AFFILIATE_APP_ID && process.env.SHOPEE_AFFILIATE_SECRET ? 'approved' : 'missing',
      capabilities: {
        can_scan: Boolean(process.env.SHOPEE_AFFILIATE_APP_ID && process.env.SHOPEE_AFFILIATE_SECRET),
        can_affiliate: Boolean(process.env.SHOPEE_AFFILIATE_APP_ID && process.env.SHOPEE_AFFILIATE_SECRET),
        can_report: Boolean(process.env.SHOPEE_AFFILIATE_APP_ID && process.env.SHOPEE_AFFILIATE_SECRET),
      },
      required_env: ['SHOPEE_AFFILIATE_APP_ID', 'SHOPEE_AFFILIATE_SECRET'],
    },
    {
      platform: 'tiktokshop',
      country_code: process.env.TIKTOK_SHOP_REGION ?? 'BR',
      api_access_status: process.env.TIKTOK_SHOP_APP_KEY && process.env.TIKTOK_SHOP_APP_SECRET ? 'pending' : 'missing',
      capabilities: {
        can_scan: Boolean(process.env.TIKTOK_SHOP_APP_KEY && process.env.TIKTOK_SHOP_APP_SECRET && process.env.TIKTOK_SHOP_PRODUCT_SEARCH_PATH),
        can_affiliate: Boolean(process.env.TIKTOK_SHOP_AFFILIATE_LINK_PATH),
        can_publish: Boolean(process.env.TIKTOK_CLIENT_KEY || process.env.TIKTOK_CONTENT_APP_KEY),
      },
      required_env: ['TIKTOK_SHOP_APP_KEY', 'TIKTOK_SHOP_APP_SECRET', 'TIKTOK_SHOP_PRODUCT_SEARCH_PATH', 'TIKTOK_SHOP_AFFILIATE_LINK_PATH'],
    },
    {
      platform: 'mercadolivre',
      country_code: 'BR',
      api_access_status: process.env.ML_APP_ID && process.env.ML_CLIENT_SECRET && process.env.ML_REDIRECT_URI ? 'pending' : 'missing',
      capabilities: {
        can_scan: Boolean(process.env.ML_APP_ID),
        can_affiliate: Boolean(process.env.ML_AFFILIATE_LINK_API_URL || (process.env.ML_TRACKED_URL_TEMPLATE && process.env.ML_AFFILIATE_TAG)),
      },
      required_env: ['ML_APP_ID', 'ML_CLIENT_SECRET', 'ML_REDIRECT_URI', 'ML_AFFILIATE_LINK_API_URL or ML_TRACKED_URL_TEMPLATE + ML_AFFILIATE_TAG'],
    },
  ];

  return c.json({ data: readiness });
});

settings.post('/telegram/test', async (c) => {
  await sendScanSummary('Teste AfiliadoOS', 0, { mercadolivre: 0, shopee: 0, tiktokshop: 0 });
  return c.json({ ok: true });
});

export default settings;

import { encrypt, decrypt } from '../lib/crypto.js';
import { requireEnv } from '../lib/env.js';
import { getSupabase } from '../lib/supabase.js';
import type { AffiliateAccount, AffiliatePlatform, OAuthTokens } from '../types.js';
import { mercadoLivreOAuthUrl } from '../connectors/mercadolivre.js';
import { shopeeOAuthUrl } from '../connectors/shopee.js';
import { tiktokShopOAuthUrl } from '../connectors/tiktokshop.js';
import { fetchJson } from '../connectors/base.js';

export function getOAuthUrl(platform: AffiliatePlatform, accountId: string): string {
  if (platform === 'mercadolivre') return mercadoLivreOAuthUrl(accountId);
  if (platform === 'shopee') return shopeeOAuthUrl(accountId);
  if (platform === 'tiktokshop') return tiktokShopOAuthUrl(accountId);
  throw new Error(`Unsupported platform: ${platform}`);
}

export async function exchangeCode(platform: AffiliatePlatform, code: string, accountId: string): Promise<OAuthTokens> {
  const tokens =
    platform === 'mercadolivre'
      ? await exchangeMercadoLivreCode(code)
      : platform === 'shopee'
        ? await exchangeShopeeCode(code)
        : await exchangeTikTokCode(code);

  await saveTokens(accountId, tokens, platform);
  return tokens;
}

export async function refreshToken(platform: AffiliatePlatform, accountId: string): Promise<OAuthTokens> {
  const { data, error } = await getSupabase()
    .from('affiliate_accounts')
    .select('oauth_tokens_encrypted, platform')
    .eq('id', accountId)
    .single();

  if (error || !data?.oauth_tokens_encrypted) {
    throw new Error(`Account ${accountId} does not have refreshable tokens.`);
  }
  if (data.platform !== platform) {
    throw new Error(`Account ${accountId} platform mismatch.`);
  }

  const current = JSON.parse(decrypt(data.oauth_tokens_encrypted)) as OAuthTokens;
  if (!current.refresh_token) {
    throw new Error(`Account ${accountId} has no refresh_token.`);
  }

  const tokens =
    platform === 'mercadolivre'
      ? await refreshMercadoLivreToken(current.refresh_token)
      : platform === 'shopee'
        ? await refreshShopeeToken(current.refresh_token)
        : await refreshTikTokToken(current.refresh_token);

  await saveTokens(accountId, { ...current, ...tokens }, platform);
  return { ...current, ...tokens };
}

export async function refreshTokenIfNeeded(account: Pick<AffiliateAccount, 'id' | 'platform' | 'oauth_tokens_encrypted'>): Promise<string> {
  if (!account.oauth_tokens_encrypted) {
    throw new Error(`Account ${account.id} has no OAuth tokens.`);
  }
  const tokens = JSON.parse(decrypt(account.oauth_tokens_encrypted)) as OAuthTokens;
  const expiresAt = Number(tokens.expires_at ?? 0);
  const bufferSeconds = account.platform === 'tiktokshop' ? 30 * 60 : 10 * 60;
  if (!expiresAt || Math.floor(Date.now() / 1000) + bufferSeconds < expiresAt) {
    return tokens.access_token;
  }
  const refreshed = await refreshToken(account.platform, account.id);
  return refreshed.access_token;
}

export function startOAuthRefreshScheduler(): NodeJS.Timeout {
  return setInterval(() => {
    refreshExpiringTokens().catch((error) => {
      console.error('[oauth] token refresh sweep failed:', error instanceof Error ? error.message : error);
    });
  }, 30 * 60 * 1000);
}

async function refreshExpiringTokens(): Promise<void> {
  const { data, error } = await getSupabase()
    .from('affiliate_accounts')
    .select('id, platform, oauth_tokens_encrypted')
    .eq('status', 'active');

  if (error) throw error;
  for (const account of data ?? []) {
    if (!account.oauth_tokens_encrypted) continue;
    await refreshTokenIfNeeded({
      id: account.id,
      platform: account.platform as AffiliatePlatform,
      oauth_tokens_encrypted: account.oauth_tokens_encrypted,
    });
  }
}

async function saveTokens(accountId: string, tokens: OAuthTokens, platform: AffiliatePlatform): Promise<void> {
  const normalized = {
    ...tokens,
    expires_at: tokens.expires_at ?? (tokens.expires_in ? Math.floor(Date.now() / 1000) + Number(tokens.expires_in) : undefined),
  };

  const { error } = await getSupabase()
    .from('affiliate_accounts')
    .update({
      oauth_tokens_encrypted: encrypt(JSON.stringify(normalized)),
      status: 'active',
      api_access_status: 'approved',
      capabilities: capabilitiesForPlatform(platform),
    })
    .eq('id', accountId);

  if (error) throw error;
}

function capabilitiesForPlatform(platform: AffiliatePlatform): Record<string, boolean> {
  if (platform === 'mercadolivre') {
    return {
      can_scan: true,
      can_affiliate: Boolean(process.env.ML_AFFILIATE_LINK_API_URL || (process.env.ML_TRACKED_URL_TEMPLATE && process.env.ML_AFFILIATE_TAG)),
      can_publish: false,
      can_report: false,
    };
  }
  if (platform === 'shopee') {
    const ready = Boolean(process.env.SHOPEE_AFFILIATE_APP_ID && process.env.SHOPEE_AFFILIATE_SECRET);
    return { can_scan: ready, can_affiliate: ready, can_publish: false, can_report: ready };
  }
  return {
    can_scan: Boolean(process.env.TIKTOK_SHOP_APP_KEY && process.env.TIKTOK_SHOP_APP_SECRET && process.env.TIKTOK_SHOP_PRODUCT_SEARCH_PATH),
    can_affiliate: Boolean(process.env.TIKTOK_SHOP_AFFILIATE_LINK_PATH),
    can_publish: false,
    can_report: false,
  };
}

async function exchangeMercadoLivreCode(code: string): Promise<OAuthTokens> {
  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: requireEnv('ML_APP_ID'),
    client_secret: requireEnv('ML_CLIENT_SECRET'),
    code,
    redirect_uri: requireEnv('ML_REDIRECT_URI'),
  });

  return fetchJson<OAuthTokens>(
    'https://api.mercadolibre.com/oauth/token',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params,
    },
    'Mercado Livre OAuth exchange',
  );
}

async function refreshMercadoLivreToken(refreshTokenValue: string): Promise<OAuthTokens> {
  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: requireEnv('ML_APP_ID'),
    client_secret: requireEnv('ML_CLIENT_SECRET'),
    refresh_token: refreshTokenValue,
  });

  return fetchJson<OAuthTokens>(
    'https://api.mercadolibre.com/oauth/token',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params,
    },
    'Mercado Livre OAuth refresh',
  );
}

async function exchangeShopeeCode(code: string): Promise<OAuthTokens> {
  if (!process.env.SHOPEE_TOKEN_URL) {
    throw new Error('Shopee Affiliate API uses app credentials. Configure SHOPEE_TOKEN_URL only if Shopee approved an OAuth token endpoint for this app.');
  }

  return fetchJson<OAuthTokens>(
    process.env.SHOPEE_TOKEN_URL,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code,
        app_id: requireEnv('SHOPEE_AFFILIATE_APP_ID'),
        redirect_uri: requireEnv('SHOPEE_REDIRECT_URI'),
      }),
    },
    'Shopee OAuth exchange',
  );
}

async function refreshShopeeToken(refreshTokenValue: string): Promise<OAuthTokens> {
  if (!process.env.SHOPEE_REFRESH_URL) {
    throw new Error('Shopee Affiliate API refresh endpoint is not configured for this approved app.');
  }
  return fetchJson<OAuthTokens>(
    process.env.SHOPEE_REFRESH_URL,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        refresh_token: refreshTokenValue,
        app_id: requireEnv('SHOPEE_AFFILIATE_APP_ID'),
      }),
    },
    'Shopee OAuth refresh',
  );
}

async function exchangeTikTokCode(code: string): Promise<OAuthTokens> {
  return fetchJson<OAuthTokens>(
    process.env.TIKTOK_TOKEN_URL ?? 'https://open.tiktokapis.com/merchant/oauth/token/',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        app_key: requireEnv('TIKTOK_SHOP_APP_KEY'),
        app_secret: requireEnv('TIKTOK_SHOP_APP_SECRET'),
        auth_code: code,
        grant_type: 'authorized_code',
      }),
    },
    'TikTok Shop OAuth exchange',
  );
}

async function refreshTikTokToken(refreshTokenValue: string): Promise<OAuthTokens> {
  return fetchJson<OAuthTokens>(
    process.env.TIKTOK_REFRESH_URL ?? 'https://open.tiktokapis.com/merchant/oauth/token/',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        app_key: requireEnv('TIKTOK_SHOP_APP_KEY'),
        app_secret: requireEnv('TIKTOK_SHOP_APP_SECRET'),
        refresh_token: refreshTokenValue,
        grant_type: 'refresh_token',
      }),
    },
    'TikTok Shop OAuth refresh',
  );
}

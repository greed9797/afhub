import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';
import { test } from 'node:test';
import { buildMercadoLivreOAuthUrl, MercadoLivreConnector } from './mercadolivre.js';
import { buildShopeeAffiliateAuthorization } from './shopee.js';
import { buildTikTokShopSignature } from './tiktokshop.js';

function restoreEnv(key: string, value: string | undefined): void {
  if (typeof value === 'undefined') {
    delete process.env[key];
    return;
  }
  process.env[key] = value;
}

test('Shopee Affiliate authorization signs the exact JSON payload', () => {
  const payload = JSON.stringify({
    query: 'query ProductOffer($keyword:String!){productOfferV2(keyword:$keyword){nodes{productName}}}',
    variables: { keyword: 'moda feminina' },
  });

  const header = buildShopeeAffiliateAuthorization({
    appId: 'app_123',
    secret: 'secret_456',
    timestamp: 1_700_000_000,
    payload,
  });

  const expectedSignature = createHash('sha256')
    .update(`app_1231700000000${payload}secret_456`)
    .digest('hex');

  assert.equal(
    header,
    `SHA256 Credential=app_123, Timestamp=1700000000, Signature=${expectedSignature}`,
  );
});

test('TikTok Shop signature sorts query params and includes JSON body', () => {
  const signature = buildTikTokShopSignature({
    appSecret: 'shop_secret',
    path: '/product/202309/products/search',
    query: {
      timestamp: '1700000000',
      app_key: 'app_key',
      page_size: 50,
      sign: 'must-be-ignored',
    },
    body: JSON.stringify({ keyword: 'moda', page_size: 50 }),
  });

  const expected = createHmac('sha256', 'shop_secret')
    .update(
      'shop_secret/product/202309/products/searchapp_keyapp_keypage_size50timestamp1700000000{"keyword":"moda","page_size":50}shop_secret',
    )
    .digest('hex');

  assert.equal(signature, expected);
});

test('Mercado Livre OAuth uses fixed redirect URI and transports account in state', () => {
  const url = new URL(buildMercadoLivreOAuthUrl({
    appId: '123456',
    redirectUri: 'https://example.com/api/accounts/oauth/callback',
    accountId: 'account-abc',
  }));

  assert.equal(url.origin + url.pathname, 'https://auth.mercadolivre.com.br/authorization');
  assert.equal(url.searchParams.get('client_id'), '123456');
  assert.equal(url.searchParams.get('redirect_uri'), 'https://example.com/api/accounts/oauth/callback');
  assert.equal(url.searchParams.get('state'), 'account-abc');
  assert.equal(url.searchParams.get('response_type'), 'code');
});

test('Mercado Livre tracked template supports url/tag placeholders without OAuth tokens', async () => {
  const previousTemplate = process.env.ML_TRACKED_URL_TEMPLATE;
  const previousTag = process.env.ML_AFFILIATE_TAG;
  const previousOfficial = process.env.ML_AFFILIATE_LINK_API_URL;
  process.env.ML_TRACKED_URL_TEMPLATE = 'https://track.example/out?u={url}&tag={tag}';
  process.env.ML_AFFILIATE_TAG = 'afhub';
  delete process.env.ML_AFFILIATE_LINK_API_URL;

  try {
    const result = await new MercadoLivreConnector().generateAffiliateLink('account-without-token', 'MLB123');
    assert.equal(result.method, 'tracked_url_builder');
    assert.equal(result.url, 'https://track.example/out?u=https%3A%2F%2Fwww.mercadolivre.com.br%2Fp%2FMLB123&tag=afhub');
  } finally {
    restoreEnv('ML_TRACKED_URL_TEMPLATE', previousTemplate);
    restoreEnv('ML_AFFILIATE_TAG', previousTag);
    restoreEnv('ML_AFFILIATE_LINK_API_URL', previousOfficial);
  }
});

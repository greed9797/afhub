import assert from 'node:assert/strict';
import { test } from 'node:test';
import { calculateAnalyticsSummary, resolveDateRange } from './analytics.js';

test('calculateAnalyticsSummary returns zeros for empty datasets', () => {
  const { from, to } = resolveDateRange('2026-05-01', '2026-05-03');
  const summary = calculateAnalyticsSummary({
    from,
    to,
    events: [],
    orders: [],
    accountNamesById: {},
    accountPlatformById: {},
    productNameById: {},
    productAccountById: {},
  });

  assert.equal(summary.totals.impressions, 0);
  assert.equal(summary.totals.clicks, 0);
  assert.equal(summary.totals.orders, 0);
  assert.equal(summary.totals.gmv, 0);
  assert.equal(summary.totals.commission, 0);
  assert.equal(summary.totals.ctr, 0);
  assert.equal(summary.totals.conversionRate, 0);
  assert.equal(summary.totals.averageOrderValue, 0);
  assert.equal(summary.totals.epc, 0);
  assert.equal(summary.byDay.length, 3);
  assert.equal(summary.byAccount.length, 0);
  assert.equal(summary.topProducts.length, 0);
});

test('calculateAnalyticsSummary computes CTR, conversion and GMV totals correctly', () => {
  const { from, to } = resolveDateRange('2026-05-01', '2026-05-03');
  const summary = calculateAnalyticsSummary({
    from,
    to,
    events: [
      {
        account_id: 'acc-1',
        affiliated_product_id: 'prod-1',
        platform: 'mercadolivre',
        event_type: 'impression',
        occurred_at: '2026-05-01T08:00:00.000Z',
      },
      {
        account_id: 'acc-1',
        affiliated_product_id: 'prod-1',
        platform: 'mercadolivre',
        event_type: 'impression',
        occurred_at: '2026-05-01T09:00:00.000Z',
      },
      {
        account_id: 'acc-1',
        affiliated_product_id: 'prod-1',
        platform: 'mercadolivre',
        event_type: 'click',
        occurred_at: '2026-05-01T10:00:00.000Z',
      },
      {
        account_id: 'acc-1',
        affiliated_product_id: 'prod-1',
        platform: 'mercadolivre',
        event_type: 'click',
        occurred_at: '2026-05-01T11:00:00.000Z',
      },
      {
        account_id: 'acc-2',
        affiliated_product_id: 'prod-2',
        platform: 'shopee',
        event_type: 'impression',
        occurred_at: '2026-05-02T12:00:00.000Z',
      },
    ],
    orders: [
      {
        account_id: 'acc-1',
        affiliated_product_id: 'prod-1',
        platform: 'mercadolivre',
        gross_amount: '120.00',
        commission_amount: '12.00',
        ordered_at: '2026-05-01T15:00:00.000Z',
        status: 'paid',
      },
      {
        account_id: 'acc-2',
        affiliated_product_id: 'prod-2',
        platform: 'shopee',
        gross_amount: 80,
        commission_amount: 6,
        ordered_at: '2026-05-02T15:00:00.000Z',
        status: 'paid',
      },
    ],
    accountNamesById: {
      'acc-1': 'Conta A',
      'acc-2': 'Conta B',
    },
    accountPlatformById: {
      'acc-1': 'mercadolivre',
      'acc-2': 'shopee',
    },
    productNameById: {
      'prod-1': 'Produto 1',
      'prod-2': 'Produto 2',
    },
    productAccountById: {
      'prod-1': 'Conta A',
      'prod-2': 'Conta B',
    },
  });

  assert.equal(summary.totals.impressions, 3);
  assert.equal(summary.totals.clicks, 2);
  assert.equal(summary.totals.orders, 2);
  assert.equal(summary.totals.gmv, 200);
  assert.equal(summary.totals.commission, 18);
  assert.equal(summary.totals.ctr, 66.67);
  assert.equal(summary.totals.conversionRate, 100);
  assert.equal(summary.totals.averageOrderValue, 100);
  assert.equal(summary.totals.epc, 9);

  const firstAccount = summary.byAccount[0];
  assert.equal(firstAccount.accountName, 'Conta A');
  assert.equal(firstAccount.platform, 'mercadolivre');
  assert.equal(firstAccount.ctr, 100);
  assert.equal(firstAccount.conversionRate, 50);

  const topProduct = summary.topProducts[0];
  assert.equal(topProduct.productId, 'prod-1');
  assert.equal(topProduct.accountName, 'Conta A');
  assert.equal(topProduct.clicks, 2);
  assert.equal(topProduct.orders, 1);
  assert.equal(topProduct.gmv, 120);
  assert.equal(topProduct.conversionRate, 50);
});

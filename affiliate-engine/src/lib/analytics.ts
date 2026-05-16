const ALLOWED_PLATFORMS = new Set(['mercadolivre', 'shopee', 'tiktokshop']);

export type AnalyticsPlatform = 'mercadolivre' | 'shopee' | 'tiktokshop';
export type AnalyticsEventType = 'impression' | 'click';

export interface AnalyticsEventRow {
  account_id: string | null;
  affiliated_product_id: string | null;
  platform: string | null;
  event_type: AnalyticsEventType;
  occurred_at: string;
}

export interface AnalyticsOrderRow {
  account_id: string | null;
  affiliated_product_id: string | null;
  platform: string | null;
  gross_amount: number | string | null;
  commission_amount: number | string | null;
  ordered_at: string | null;
  status: string | null;
}

export interface AnalyticsSummaryInput {
  from: string;
  to: string;
  events: AnalyticsEventRow[];
  orders: AnalyticsOrderRow[];
  accountNamesById: Record<string, string>;
  accountPlatformById: Record<string, string>;
  productNameById: Record<string, string>;
  productAccountById: Record<string, string>;
}

export type AnalyticsSummary = {
  totals: {
    impressions: number;
    clicks: number;
    orders: number;
    gmv: number;
    commission: number;
    ctr: number;
    conversionRate: number;
    averageOrderValue: number;
    epc: number;
  };
  byAccount: Array<{
    accountId: string;
    accountName: string;
    platform: string;
    clicks: number;
    orders: number;
    gmv: number;
    commission: number;
    ctr: number;
    conversionRate: number;
  }>;
  byDay: Array<{
    date: string;
    impressions: number;
    clicks: number;
    orders: number;
    gmv: number;
    commission: number;
  }>;
  topProducts: Array<{
    productId: string;
    name: string;
    accountName: string;
    clicks: number;
    orders: number;
    gmv: number;
    conversionRate: number;
  }>;
};

export interface DateRange {
  from: string;
  to: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function toSafeNumber(value: string | number | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeDate(date: string): Date {
  const match = /^\d{4}-\d{2}-\d{2}$/.exec(date);
  if (!match) {
    const parsed = new Date(date);
    if (Number.isNaN(parsed.getTime())) {
      throw new Error(`Invalid date: ${date}`);
    }
    return parsed;
  }
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

export function resolveDateRange(from?: string, to?: string, now = new Date()): DateRange {
  const toDate = to ? normalizeDate(to) : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));
  const fromDate = from
    ? normalizeDate(from)
    : new Date(Date.UTC(toDate.getUTCFullYear(), toDate.getUTCMonth(), toDate.getUTCDate(), 0, 0, 0, 0) - 29 * DAY_MS);

  return {
    from: fromDate.toISOString(),
    to: toDate.toISOString(),
  };
}

export function buildDateRangeFromPreset(
  preset: 'today' | '7d' | '30d' | 'month',
  now = new Date(),
): DateRange {
  const utcDayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
  if (preset === 'today') {
    return {
      from: utcDayStart.toISOString(),
      to: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999)).toISOString(),
    };
  }
  if (preset === '7d') {
    return {
      from: new Date(utcDayStart.getTime() - 6 * DAY_MS).toISOString(),
      to: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999)).toISOString(),
    };
  }
  if (preset === 'month') {
    return {
      from: monthStart.toISOString(),
      to: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999)).toISOString(),
    };
  }
  return resolveDateRange(undefined, undefined, now);
}

function dateKey(value?: string | null): string {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toISOString().slice(0, 10);
}

export function isAllowedPlatform(value: string | undefined | null): value is AnalyticsPlatform {
  return typeof value === 'string' && ALLOWED_PLATFORMS.has(value);
}

function ensureDayMap(from: string, to: string): Map<string, { impressions: number; clicks: number; orders: number; gmv: number; commission: number }> {
  const start = new Date(from);
  const end = new Date(to);
  const startUtc = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
  const endUtc = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
  if (Number.isNaN(startUtc) || Number.isNaN(endUtc)) {
    throw new Error('Invalid date range.');
  }

  const map = new Map<string, { impressions: number; clicks: number; orders: number; gmv: number; commission: number }>();
  for (let cursor = startUtc; cursor <= endUtc; cursor += DAY_MS) {
    const key = new Date(cursor).toISOString().slice(0, 10);
    map.set(key, { impressions: 0, clicks: 0, orders: 0, gmv: 0, commission: 0 });
  }
  return map;
}

export function calculateAnalyticsSummary(input: AnalyticsSummaryInput): AnalyticsSummary {
  const totals = { impressions: 0, clicks: 0, orders: 0, gmv: 0, commission: 0 };
  const byAccountMap = new Map<
    string,
    {
      accountName: string;
      platform: string;
      impressions: number;
      clicks: number;
      orders: number;
      gmv: number;
      commission: number;
    }
  >();

  const productMap = new Map<
    string,
    {
      name: string;
      accountName: string;
      clicks: number;
      orders: number;
      gmv: number;
      commission: number;
    }
  >();

  const dayMap = ensureDayMap(input.from, input.to);

  for (const event of input.events) {
    if (!event.account_id || !event.platform || (event.event_type !== 'impression' && event.event_type !== 'click')) continue;
    const day = dateKey(event.occurred_at);
    if (!day || !dayMap.has(day)) continue;

    const bucket = dayMap.get(day);
    if (!bucket) continue;
    if (event.event_type === 'impression') {
      totals.impressions += 1;
      bucket.impressions += 1;
      const accountBucket = byAccountMap.get(event.account_id);
      if (accountBucket) {
        accountBucket.impressions += 1;
      } else {
        byAccountMap.set(event.account_id, {
          accountName: input.accountNamesById[event.account_id] ?? 'Conta indisponível',
          platform: input.accountPlatformById[event.account_id] ?? event.platform,
          impressions: 1,
          clicks: 0,
          orders: 0,
          gmv: 0,
          commission: 0,
        });
      }
    } else {
      totals.clicks += 1;
      bucket.clicks += 1;
      const accountBucket = byAccountMap.get(event.account_id);
      if (accountBucket) {
        accountBucket.clicks += 1;
      } else {
        byAccountMap.set(event.account_id, {
          accountName: input.accountNamesById[event.account_id] ?? 'Conta indisponível',
          platform: input.accountPlatformById[event.account_id] ?? event.platform,
          impressions: 0,
          clicks: 1,
          orders: 0,
          gmv: 0,
          commission: 0,
        });
      }

      if (event.affiliated_product_id && productMap.has(event.affiliated_product_id)) {
        const productBucket = productMap.get(event.affiliated_product_id);
        if (productBucket) productBucket.clicks += 1;
      } else if (event.affiliated_product_id) {
        productMap.set(event.affiliated_product_id, {
          name: input.productNameById[event.affiliated_product_id] ?? 'Produto indisponível',
          accountName: input.productAccountById[event.affiliated_product_id] ?? 'Conta indisponível',
          clicks: 1,
          orders: 0,
          gmv: 0,
          commission: 0,
        });
      }
    }
  }

  for (const order of input.orders) {
    if (!order.account_id || !order.platform || !order.ordered_at) continue;
    const day = dateKey(order.ordered_at);
    if (!day || !dayMap.has(day)) continue;

    const grossAmount = toSafeNumber(order.gross_amount);
    const commissionAmount = toSafeNumber(order.commission_amount);

    totals.orders += 1;
    totals.gmv += grossAmount;
    totals.commission += commissionAmount;

    const bucket = dayMap.get(day);
    if (bucket) {
      bucket.orders += 1;
      bucket.gmv += grossAmount;
      bucket.commission += commissionAmount;
    }

    const accountBucket = byAccountMap.get(order.account_id);
    if (accountBucket) {
      accountBucket.orders += 1;
      accountBucket.gmv += grossAmount;
      accountBucket.commission += commissionAmount;
    } else {
      byAccountMap.set(order.account_id, {
        accountName: input.accountNamesById[order.account_id] ?? 'Conta indisponível',
        platform: input.accountPlatformById[order.account_id] ?? order.platform,
        impressions: 0,
        clicks: 0,
        orders: 1,
        gmv: grossAmount,
        commission: commissionAmount,
      });
    }

    if (!order.affiliated_product_id) continue;
    const productBucket = productMap.get(order.affiliated_product_id);
    if (productBucket) {
      productBucket.orders += 1;
      productBucket.gmv += grossAmount;
      productBucket.commission += commissionAmount;
    } else {
      productMap.set(order.affiliated_product_id, {
        name: input.productNameById[order.affiliated_product_id] ?? 'Produto indisponível',
        accountName: input.productAccountById[order.affiliated_product_id] ?? 'Conta indisponível',
        clicks: 0,
        orders: 1,
        gmv: grossAmount,
        commission: commissionAmount,
      });
    }
  }

  const byAccount = [...byAccountMap.entries()]
    .map(([accountId, value]) => {
      const conversionRate = value.clicks > 0 ? (value.orders / value.clicks) * 100 : 0;
      const ctr = value.impressions > 0 ? (value.clicks / value.impressions) * 100 : 0;
      return {
        accountId,
        accountName: value.accountName,
        platform: value.platform,
        clicks: value.clicks,
        orders: value.orders,
        gmv: value.gmv,
        commission: value.commission,
        ctr: Number(ctr.toFixed(2)),
        conversionRate: Number(conversionRate.toFixed(2)),
      };
    })
    .sort((a, b) => b.gmv - a.gmv);

  const byDay = [...dayMap.entries()]
    .map(([date, bucket]) => ({
      date,
      impressions: bucket.impressions,
      clicks: bucket.clicks,
      orders: bucket.orders,
      gmv: bucket.gmv,
      commission: bucket.commission,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const totalCtr = totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0;
  const totalConversion = totals.clicks > 0 ? (totals.orders / totals.clicks) * 100 : 0;
  const averageOrderValue = totals.orders > 0 ? totals.gmv / totals.orders : 0;
  const epc = totals.clicks > 0 ? totals.commission / totals.clicks : 0;

  const topProducts = [...productMap.entries()]
    .map(([productId, value]) => ({
      productId,
      name: value.name,
      accountName: value.accountName,
      clicks: value.clicks,
      orders: value.orders,
      gmv: value.gmv,
      conversionRate: value.clicks > 0 ? Number(((value.orders / value.clicks) * 100).toFixed(2)) : 0,
    }))
    .sort((a, b) => b.gmv - a.gmv)
    .slice(0, 10);

  return {
    totals: {
      impressions: totals.impressions,
      clicks: totals.clicks,
      orders: totals.orders,
      gmv: totals.gmv,
      commission: totals.commission,
      ctr: Number(totalCtr.toFixed(2)),
      conversionRate: Number(totalConversion.toFixed(2)),
      averageOrderValue: Number(averageOrderValue.toFixed(2)),
      epc: Number(epc.toFixed(2)),
    },
    byAccount,
    byDay,
    topProducts,
  };
}

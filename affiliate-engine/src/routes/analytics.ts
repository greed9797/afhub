import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import {
  calculateAnalyticsSummary,
  isAllowedPlatform,
  type AnalyticsEventRow,
  type AnalyticsPlatform,
  type AnalyticsOrderRow,
  resolveDateRange,
  type AnalyticsEventType,
  type DateRange,
} from '../lib/analytics.js';
import { getSupabase } from '../lib/supabase.js';
import { importPlatformOrders } from '../services/analytics-import/index.js';

const analytics = new Hono();

function parseEventType(value: unknown): value is AnalyticsEventType {
  return value === 'impression' || value === 'click';
}

function parseDate(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function parseNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseStatus(value: unknown): string {
  return typeof value === 'string' && value.trim() ? value.trim() : 'imported';
}

function parsePlatform(value: unknown): string | null {
  return typeof value === 'string' && isAllowedPlatform(value.trim().toLowerCase()) ? value.trim().toLowerCase() : null;
}

function parsePlatformOrAll(value: unknown): 'all' | AnalyticsPlatform | null {
  if (typeof value !== 'string') return 'all';
  const normalized = value.trim().toLowerCase();
  if (!normalized) return 'all';
  if (normalized === 'all') return 'all';
  if (isAllowedPlatform(normalized)) return normalized;
  return null;
}

function parseUuid(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return /^[0-9a-fA-F-]{36}$/.test(trimmed) ? trimmed : null;
}

function parseCsvLine(line: string): string[] {
  const parts: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (char === ',' && !inQuotes) {
      parts.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }
  parts.push(current.trim());
  return parts.map((part) => part.replace(/^"|"$/g, ''));
}

function parseCsvRows(raw: string): Array<Record<string, string>> {
  const lines = raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length) return [];

  const headers = parseCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const columns = parseCsvLine(line);
    const row: Record<string, string> = {};
    headers.forEach((header, index) => {
      row[header] = columns[index] ?? '';
    });
    return row;
  });
}

function parseCsvInput(raw: string) {
  const rows = parseCsvRows(raw);
  return rows
    .map((row) => {
      const platformOrderId = row.platform_order_id?.trim();
      const platform = parsePlatform(row.platform);
      if (!platformOrderId || !platform) return null;

      return {
        platform_order_id: platformOrderId,
        platform,
        account_id: row.account_id?.trim() || null,
        affiliated_product_id: row.affiliated_product_id?.trim() || null,
        publication_id: row.publication_id?.trim() || null,
        status: parseStatus(row.status),
        gross_amount: parseNumber(row.gross_amount),
        commission_amount: parseNumber(row.commission_amount),
        currency: (row.currency || 'BRL').trim().toUpperCase(),
        ordered_at: parseDate(row.ordered_at) || new Date().toISOString(),
        raw_data: (() => {
          if (!row.raw_data) return undefined;
          try {
            const parsed = JSON.parse(row.raw_data);
            return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : undefined;
          } catch {
            return undefined;
          }
        })(),
      };
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row));
}

type ImportRow = {
  platform_order_id: string;
  platform: string;
  account_id: string | null;
  affiliated_product_id: string | null;
  publication_id: string | null;
  status: string;
  gross_amount: number;
  commission_amount: number;
  currency: string;
  ordered_at: string;
  raw_data?: Record<string, unknown>;
};

type ImportRows = ImportRow[];

function normalizeImportRows(rows: ImportRow[]): ImportRow[] {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const key = `${row.platform}::${row.platform_order_id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildSummaryRange(rangeFrom: string | null, rangeTo: string | null): DateRange {
  return resolveDateRange(rangeFrom ?? undefined, rangeTo ?? undefined);
}

analytics.get('/summary', async (c) => {
  const accountId = c.req.query('account_id')?.trim() || 'all';
  const platform = parsePlatformOrAll(c.req.query('platform'));
  const rangeFrom = c.req.query('from');
  const rangeTo = c.req.query('to');

  if (!platform) {
    return c.json({ error: 'platform must be one of: all, mercadolivre, shopee, tiktokshop.' }, 400);
  }

  let range: DateRange;
  try {
    range = buildSummaryRange(rangeFrom || null, rangeTo || null);
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Invalid date range.' }, 400);
  }

  let eventsQuery = getSupabase()
    .from('affiliate_events')
    .select('account_id, affiliated_product_id, platform, event_type, occurred_at')
    .gte('occurred_at', range.from)
    .lte('occurred_at', range.to);

  let ordersQuery = getSupabase()
    .from('affiliate_orders')
    .select('account_id, affiliated_product_id, platform, gross_amount, commission_amount, ordered_at, status')
    .gte('ordered_at', range.from)
    .lte('ordered_at', range.to);

  if (platform !== 'all') {
    eventsQuery = eventsQuery.eq('platform', platform);
    ordersQuery = ordersQuery.eq('platform', platform);
  }
  if (accountId !== 'all') {
    if (!parseUuid(accountId)) return c.json({ error: 'account_id must be a UUID or "all".' }, 400);
    eventsQuery = eventsQuery.eq('account_id', accountId);
    ordersQuery = ordersQuery.eq('account_id', accountId);
  }

  const [eventsResult, ordersResult] = await Promise.all([eventsQuery, ordersQuery]);
  if (eventsResult.error) return c.json({ error: eventsResult.error.message }, 500);
  if (ordersResult.error) return c.json({ error: ordersResult.error.message }, 500);

  const events: AnalyticsEventRow[] = (eventsResult.data ?? []) as AnalyticsEventRow[];
  const orders: AnalyticsOrderRow[] = (ordersResult.data ?? []) as AnalyticsOrderRow[];

  const accountIds = new Set<string>();
  events.forEach((event) => {
    if (event.account_id) accountIds.add(event.account_id);
  });
  orders.forEach((order) => {
    if (order.account_id) accountIds.add(order.account_id);
  });

  const productIds = new Set<string>();
  events.forEach((event) => {
    if (event.affiliated_product_id) productIds.add(event.affiliated_product_id);
  });
  orders.forEach((order) => {
    if (order.affiliated_product_id) productIds.add(order.affiliated_product_id);
  });

  const accountList = [...accountIds];
  const productList = [...productIds];

  const accountNamesById: Record<string, string> = {};
  const accountPlatformById: Record<string, string> = {};
  if (accountList.length) {
    const { data: accounts, error: accountsError } = await getSupabase()
      .from('affiliate_accounts')
      .select('id, nome, platform')
      .in('id', accountList);

    if (accountsError) return c.json({ error: accountsError.message }, 500);
    (accounts ?? []).forEach((account) => {
      if (!account?.id) return;
      accountNamesById[account.id] = account.nome;
      accountPlatformById[account.id] = account.platform;
    });
  }

  const productNameById: Record<string, string> = {};
  const productAccountById: Record<string, string> = {};
  if (productList.length) {
    const { data: products, error: productsError } = await getSupabase()
      .from('affiliated_products')
      .select('id, account_id, product_candidates(nome)')
      .in('id', productList);

    if (productsError) return c.json({ error: productsError.message }, 500);
    (products ?? []).forEach((product) => {
      const typedProduct = product as {
        id?: string;
        account_id?: string | null;
        product_candidates?: { nome?: string | null } | Array<{ nome?: string | null }> | null;
      };
      if (!typedProduct.id) return;
      const candidate = Array.isArray(typedProduct.product_candidates)
        ? typedProduct.product_candidates[0]
        : typedProduct.product_candidates;
      productNameById[typedProduct.id] = candidate?.nome ?? 'Produto indisponível';
      if (typedProduct.account_id) {
        productAccountById[typedProduct.id] = accountNamesById[typedProduct.account_id] ?? 'Conta indisponível';
      }
    });
  }

  return c.json(
    calculateAnalyticsSummary({
      from: range.from,
      to: range.to,
      events,
      orders,
      accountNamesById,
      accountPlatformById,
      productNameById,
      productAccountById,
    }),
  );
});

analytics.post('/events', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const eventType = body.event_type ?? body.eventType;
  if (!parseEventType(eventType)) {
    return c.json({ error: 'event_type is required and must be impression or click.' }, 400);
  }

  const occurredAt = parseDate(body.occurred_at) ?? new Date().toISOString();
  let affiliatedProductId = parseUuid(body.affiliated_product_id);
  let publicationId = parseUuid(body.publication_id);
  let accountId = parseUuid(body.account_id);
  let platform = parsePlatform(body.platform);

  if (!affiliatedProductId && publicationId) {
    const { data: publication, error: publicationError } = await getSupabase()
      .from('publications')
      .select('id, video_jobs(affiliated_products(id, account_id, platform))')
      .eq('id', publicationId)
      .single();

    if (publicationError || !publication) {
      return c.json({ error: publicationError?.message ?? 'Publication not found.' }, 404);
    }

    const publicationPayload = publication as {
      video_jobs?: { affiliated_products?: { id?: string; account_id?: string; platform?: string } } | { affiliated_products?: { id?: string; account_id?: string; platform?: string } }[];
    };

    const videoJob = Array.isArray(publicationPayload.video_jobs)
      ? publicationPayload.video_jobs[0]
      : publicationPayload.video_jobs;
    const affiliatedProduct = videoJob?.affiliated_products;
    if (!affiliatedProduct) {
      return c.json({ error: 'Publication has no linked affiliated product.' }, 400);
    }

    if (!affiliatedProductId) affiliatedProductId = affiliatedProduct.id ? affiliatedProduct.id.trim() : null;
    if (!accountId && affiliatedProduct.account_id) accountId = affiliatedProduct.account_id;
    if (!platform) platform = parsePlatform(affiliatedProduct.platform);
  }

  if (!affiliatedProductId) {
    return c.json({ error: 'affiliated_product_id or publication_id is required.' }, 400);
  }
  if (!accountId) {
    const { data: product, error: productError } = await getSupabase()
      .from('affiliated_products')
      .select('id, account_id, platform')
      .eq('id', affiliatedProductId)
      .single();
    if (!product || productError) {
      return c.json({ error: productError?.message ?? 'Affiliate product not found.' }, 404);
    }
    accountId = product.account_id;
    platform = parsePlatform(product.platform);
  }

  if (!platform) {
    return c.json({ error: 'Could not resolve platform for this event.' }, 400);
  }
  if (!accountId) {
    return c.json({ error: 'Could not resolve account for this event.' }, 400);
  }

  const rawData = typeof body.raw_data === 'object' && body.raw_data !== null && !Array.isArray(body.raw_data) ? body.raw_data : undefined;
  const { error } = await getSupabase().from('affiliate_events').insert({
    account_id: accountId,
    affiliated_product_id: affiliatedProductId,
    publication_id: publicationId,
    platform,
    event_type: eventType,
    occurred_at: occurredAt,
    raw_data: rawData ?? null,
  });
  if (error) {
    return c.json({ error: error.message }, 500);
  }

  return c.json(
    {
      ok: true,
      data: {
        affiliated_product_id: affiliatedProductId,
        publication_id: publicationId,
        platform,
        event_type: eventType,
        occurred_at: occurredAt,
      },
    },
    201,
  );
});

analytics.post('/import', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const requestPlatform = parsePlatform(body.platform);
  const source = typeof body.source === 'string' ? body.source.trim().toLowerCase() : 'manual';
  const from = parseDate(body.from);
  const to = parseDate(body.to);
  const recordsInput = Array.isArray(body.records) ? (body.records as Array<Record<string, unknown>>) : [];
  const csv = typeof body.csv === 'string' ? body.csv : '';

  const manualRows = recordsInput
    .map((record) => {
      const platformOrderId = typeof record.platform_order_id === 'string' ? record.platform_order_id.trim() : '';
      const platform = parsePlatform(record.platform) ?? requestPlatform;
      if (!platformOrderId || !platform) return null;

      return {
        platform_order_id: platformOrderId,
        platform,
        account_id: typeof record.account_id === 'string' && record.account_id.trim() ? record.account_id.trim() : null,
        affiliated_product_id:
          typeof record.affiliated_product_id === 'string' && record.affiliated_product_id.trim()
            ? record.affiliated_product_id.trim()
            : null,
        publication_id:
          typeof record.publication_id === 'string' && record.publication_id.trim() ? record.publication_id.trim() : null,
        status: parseStatus(record.status),
        gross_amount: parseNumber(record.gross_amount),
        commission_amount: parseNumber(record.commission_amount),
        currency:
          typeof record.currency === 'string' && record.currency.trim() ? record.currency.trim().toUpperCase() : 'BRL',
        ordered_at: parseDate(record.ordered_at) ?? new Date().toISOString(),
        raw_data: (() => {
          if (!record.raw_data || typeof record.raw_data !== 'object' || record.raw_data === null || Array.isArray(record.raw_data)) {
            return undefined;
          }
          return record.raw_data as Record<string, unknown>;
        })(),
      };
    })
    .filter((record): record is NonNullable<typeof record> => Boolean(record));

  const csvRows = csv ? parseCsvInput(csv) : [];
  let rows: ImportRows = [...manualRows, ...csvRows];

  if (source === 'official') {
    if (!requestPlatform) return c.json({ error: 'platform is required for official import.' }, 400);
    try {
      const officialRows = await importPlatformOrders({ platform: requestPlatform, from, to });
      const converted = officialRows.map((row) => ({
        platform_order_id: row.platform_order_id,
        platform: requestPlatform,
        account_id: row.account_id ?? null,
        affiliated_product_id: row.affiliated_product_id ?? null,
        publication_id: row.publication_id ?? null,
        status: parseStatus(row.status),
        gross_amount: parseNumber(row.gross_amount),
        commission_amount: parseNumber(row.commission_amount),
        currency: (row.currency || 'BRL').toUpperCase(),
        ordered_at: parseDate(row.ordered_at) || new Date().toISOString(),
        raw_data: row.raw_data,
      }));
      rows = [...rows, ...converted];
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : 'Could not import official report.' }, 400);
    }
  }

  rows = normalizeImportRows(rows);
  if (!rows.length) {
    return c.json({ error: 'No valid rows to import.' }, 400);
  }

  const normalizedPlatformSet = new Set(rows.map((row) => row.platform));
  if (normalizedPlatformSet.size !== 1) {
    return c.json({ error: 'All rows must use the same platform per import run.' }, 400);
  }

  const platform = rows[0].platform;
  const importId = randomUUID();
  const startedAt = new Date().toISOString();

  const { error: ordersError } = await getSupabase().from('affiliate_orders').upsert(
    rows.map((row) => ({
      platform,
      platform_order_id: row.platform_order_id,
      account_id: row.account_id,
      affiliated_product_id: row.affiliated_product_id,
      publication_id: row.publication_id,
      status: row.status,
      gross_amount: row.gross_amount,
      commission_amount: row.commission_amount,
      currency: row.currency,
      ordered_at: row.ordered_at,
      occurred_at: row.ordered_at,
      raw_data: row.raw_data ?? null,
    })),
    {
      onConflict: 'platform,platform_order_id',
      ignoreDuplicates: false,
    },
  );
  if (ordersError) {
    await getSupabase().from('affiliate_metric_imports').insert({
      id: importId,
      platform,
      import_source: source,
      status: 'error',
      started_at: startedAt,
      completed_at: new Date().toISOString(),
      record_count: rows.length,
      imported_count: 0,
      raw_data: {
        error: ordersError.message,
        source: c.req.header('x-import-source') ?? 'admin-api',
      },
    });
    return c.json({ error: ordersError.message }, 500);
  }

  await getSupabase().from('affiliate_metric_imports').insert({
    id: importId,
    platform,
    import_source: source,
    status: 'success',
    started_at: startedAt,
    completed_at: new Date().toISOString(),
    record_count: rows.length,
    imported_count: rows.length,
    raw_data: {
      source: c.req.header('x-import-source') ?? 'admin-api',
      from,
      to,
    },
  });

  return c.json({ ok: true, importId, count: rows.length });
});

export const trackingRedirect = new Hono();

trackingRedirect.get('/:affiliatedProductId', async (c) => {
  const affiliatedProductId = c.req.param('affiliatedProductId');
  const publicationId = parseUuid(c.req.query('publication_id'));

  if (!affiliatedProductId || !parseUuid(affiliatedProductId)) {
    return c.json({ error: 'affiliatedProductId is required.' }, 400);
  }

  const { data: product, error } = await getSupabase()
    .from('affiliated_products')
    .select('id, affiliate_link, status, account_id, platform')
    .eq('id', affiliatedProductId)
    .single();

  if (error || !product) {
    return c.json({ error: error?.message ?? 'Affiliate product not found.' }, 404);
  }
  if (product.status !== 'active') {
    return c.json({ error: 'Affiliate product is not active.' }, 409);
  }

  const target = (() => {
    try {
      return new URL(product.affiliate_link);
    } catch {
      return null;
    }
  })();

  if (!target) {
    return c.json({ error: 'Affiliate link is invalid.' }, 500);
  }

  void getSupabase()
    .from('affiliate_events')
    .insert({
      account_id: product.account_id,
      affiliated_product_id: product.id,
      publication_id: publicationId,
      platform: product.platform,
      event_type: 'click',
      occurred_at: new Date().toISOString(),
      raw_data: {
        source: 'tracked_redirect',
        utm_source: c.req.query('utm_source'),
        utm_medium: c.req.query('utm_medium'),
        utm_campaign: c.req.query('utm_campaign'),
        publication_id: c.req.query('publication_id'),
      },
    })
    .then(({ error: insertError }) => {
      if (insertError) console.warn('[analytics] tracked redirect event insert failed:', insertError.message);
    });

  ['utm_source', 'utm_medium', 'utm_campaign', 'publication_id'].forEach((key) => {
    const value = c.req.query(key);
    if (value) target.searchParams.set(key, value);
  });

  return c.redirect(target.toString(), 302);
});

export default analytics;

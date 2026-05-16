import { allConnectors } from '../connectors/index.js';
import { ConnectorAccessError, defaultFilters, type Filters, type RawProduct } from '../connectors/base.js';
import { getSupabase } from '../lib/supabase.js';
import type { AffiliateAccount, AffiliatePlatform, Niche } from '../types.js';
import { sendScanSummary } from './telegram.js';

export interface ScanSummary {
  total: number;
  byPlatform: Record<AffiliatePlatform, number>;
}

export function calculateScore(product: RawProduct): number {
  const comissaoNorm = Math.min(product.comissaoPercent / 20, 1);
  const vendasNorm = Math.min(product.vendasMes / 5000, 1);
  const avaliacaoNorm = product.avaliacao / 5;
  return Number(((comissaoNorm * 0.5 + vendasNorm * 0.3 + avaliacaoNorm * 0.2) * 100).toFixed(2));
}

export async function runScan(nicheId: string): Promise<ScanSummary> {
  const { data: niche, error } = await getSupabase()
    .from('niches')
    .select('*')
    .eq('id', nicheId)
    .single();

  if (error || !niche) {
    throw error ?? new Error(`Niche not found: ${nicheId}`);
  }

  const filters = defaultFilters((niche as Niche).filters);
  const results = await Promise.allSettled(
    allConnectors.map(async ({ platform, connector }) => {
      const products = await connector.search((niche as Niche).keywords, filters);
      return { platform, products };
    }),
  );

  const byPlatform: Record<AffiliatePlatform, number> = {
    mercadolivre: 0,
    shopee: 0,
    tiktokshop: 0,
  };
  const rows: Array<Record<string, unknown>> = [];
  const seen = new Set<string>();

  for (const result of results) {
    if (result.status === 'rejected') {
      if (result.reason instanceof ConnectorAccessError) {
        console.warn(`[scanner] ${result.reason.platform} unavailable: ${result.reason.message}`);
      } else {
        console.error('[scanner] connector failed:', result.reason instanceof Error ? result.reason.message : result.reason);
      }
      continue;
    }

    const filtered = result.value.products
      .filter((product) => passesFilters(product, filters))
      .map((product) => ({ product, score: calculateScore(product) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 20);

    byPlatform[result.value.platform] = filtered.length;

    for (const { product, score } of filtered) {
      const dedupeKey = `${result.value.platform}:${product.productId}:${nicheId}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      rows.push({
        niche_id: nicheId,
        platform: result.value.platform,
        product_id: product.productId,
        seller_id: product.sellerId,
        nome: product.nome,
        descricao: product.descricao,
        preco: product.preco,
        imagens: product.imagens,
        comissao_percent: product.comissaoPercent,
        vendas_mes: product.vendasMes,
        avaliacao: product.avaliacao,
        score,
        raw_data: product.rawData,
        source_api: product.sourceApi ?? `${result.value.platform}_api`,
        affiliability_status: product.affiliabilityStatus ?? 'unknown',
        commission_source: product.commissionSource ?? 'unavailable',
        seller_metrics_source: product.sellerMetricsSource ?? `${result.value.platform}_api`,
        status: 'pending',
      });
    }
  }

  if (rows.length > 0) {
    const { error: insertError } = await getSupabase()
      .from('product_candidates')
      .upsert(rows, { onConflict: 'platform,product_id,niche_id', ignoreDuplicates: false });
    if (insertError) throw insertError;
  }

  await sendScanSummary((niche as Niche).nome, rows.length, byPlatform).catch((notificationError) => {
    console.error('[scanner] telegram summary failed:', notificationError instanceof Error ? notificationError.message : notificationError);
  });

  return { total: rows.length, byPlatform };
}

export async function selectAccount(platform: string, nicheId: string): Promise<AffiliateAccount> {
  const { data: accounts, error } = await getSupabase()
    .from('affiliate_accounts')
    .select('*')
    .eq('platform', platform)
    .eq('status', 'active')
    .eq('api_access_status', 'approved');

  if (error) throw error;
  const capableAccounts = (accounts as AffiliateAccount[] | null ?? []).filter((account) => account.capabilities?.can_affiliate !== false);
  if (!capableAccounts.length) {
    throw new Error(`No approved affiliate-capable account available for platform ${platform}.`);
  }

  const scored = await Promise.all(
    capableAccounts.map(async (account) => {
      const { data } = await getSupabase()
        .from('affiliated_products')
        .select('candidate_id, product_candidates!inner(niche_id)')
        .eq('account_id', account.id);

      const count = (data ?? []).filter((row) => {
        const candidate = row.product_candidates as unknown as { niche_id?: string };
        return candidate?.niche_id === nicheId;
      }).length;
      return { account, count };
    }),
  );

  scored.sort((a, b) => a.count - b.count);
  return scored[0].account;
}

function passesFilters(product: RawProduct, filters: Filters): boolean {
  return (
    product.comissaoPercent >= filters.comissaoMin &&
    product.vendasMes >= filters.vendasMin &&
    product.preco >= filters.precoMin &&
    product.preco <= filters.precoMax &&
    product.avaliacao >= filters.avaliacaoMin
  );
}

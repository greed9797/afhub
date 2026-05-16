import type { OfficialImportOrder } from './index.js';

type OfficialImportParams = {
  from?: string | null;
  to?: string | null;
};

function getReportUrl(): string | null {
  const reportUrl = process.env.SHOPEE_REPORT_API_URL?.trim();
  const appId = process.env.SHOPEE_AFFILIATE_APP_ID?.trim();
  const appSecret = process.env.SHOPEE_AFFILIATE_SECRET?.trim();
  if (!reportUrl || !appId || !appSecret) return null;
  return reportUrl;
}

export async function fetchShopeeOfficialOrders(params: OfficialImportParams): Promise<OfficialImportOrder[]> {
  const reportUrl = getReportUrl();
  if (!reportUrl) {
    throw new Error('Shopee report API connector is not configured. Use manual source with source=manual.');
  }
  if (!params.from && !params.to) return [];

  // Placeholder for future Shopee official affiliate report integration.
  // Keep credentials and endpoint validation in a dedicated module for future rollout.
  throw new Error('Shopee report API integration is not implemented in this release.');
}

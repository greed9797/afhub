import type { OfficialImportOrder } from './index.js';

type OfficialImportParams = {
  from?: string | null;
  to?: string | null;
};

function getReportUrl(): string | null {
  const reportUrl = process.env.TIKTOK_REPORT_API_URL?.trim();
  const appKey = process.env.TIKTOK_SHOP_APP_KEY?.trim();
  const appSecret = process.env.TIKTOK_SHOP_APP_SECRET?.trim();
  if (!reportUrl || !appKey || !appSecret) return null;
  return reportUrl;
}

export async function fetchTikTokShopOfficialOrders(params: OfficialImportParams): Promise<OfficialImportOrder[]> {
  const reportUrl = getReportUrl();
  if (!reportUrl) {
    throw new Error('TikTok Shop report API connector is not configured. Use manual source with source=manual.');
  }
  if (!params.from && !params.to) return [];

  // Placeholder for future TikTok Shop report integration.
  // Keep validation in one place so the official endpoint can be flipped once available.
  throw new Error('TikTok Shop report API integration is not implemented in this release.');
}

import type { OfficialImportOrder } from './index.js';

type OfficialImportParams = {
  from?: string | null;
  to?: string | null;
};

function getReportUrl(): string | null {
  const reportUrl = process.env.ML_AFFILIATE_REPORT_API_URL?.trim();
  const clientSecret = process.env.ML_CLIENT_SECRET?.trim();
  const appId = process.env.ML_APP_ID?.trim();
  if (!reportUrl || !clientSecret || !appId) return null;
  return reportUrl;
}

export async function fetchMercadoLivreOfficialOrders(params: OfficialImportParams): Promise<OfficialImportOrder[]> {
  const reportUrl = getReportUrl();
  if (!reportUrl) {
    throw new Error('Mercado Livre report API connector is not configured. Use manual source with source=manual.');
  }
  if (!params.from && !params.to) return [];

  // Placeholder for future Mercado Livre report connector.
  // Keep endpoint and credentials validation centralized here so production paths can be activated safely.
  throw new Error('Mercado Livre report API integration is not implemented in this release.');
}

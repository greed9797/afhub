import { isAllowedPlatform } from '../../lib/analytics.js';
import type { AffiliatePlatform } from '../../types.js';
import { fetchMercadoLivreOfficialOrders } from './mercadolivre.js';
import { fetchShopeeOfficialOrders } from './shopee.js';
import { fetchTikTokShopOfficialOrders } from './tiktokshop.js';

export type OfficialImportOrder = {
  platform_order_id: string;
  account_id?: string | null;
  affiliated_product_id?: string | null;
  publication_id?: string | null;
  status?: string | null;
  gross_amount: number | string;
  commission_amount: number | string;
  currency?: string | null;
  ordered_at: string;
  raw_data?: Record<string, unknown>;
};

type ImportRequest = {
  platform: string;
  from?: string | null;
  to?: string | null;
};

export async function importPlatformOrders(request: ImportRequest): Promise<OfficialImportOrder[]> {
  if (!isAllowedPlatform(request.platform)) {
    throw new Error('Unsupported platform for import.');
  }
  const platform = request.platform as AffiliatePlatform;
  switch (platform) {
    case 'mercadolivre':
      return fetchMercadoLivreOfficialOrders({ from: request.from, to: request.to });
    case 'shopee':
      return fetchShopeeOfficialOrders({ from: request.from, to: request.to });
    case 'tiktokshop':
      return fetchTikTokShopOfficialOrders({ from: request.from, to: request.to });
    default:
      throw new Error('Platform is not supported for report import.');
  }
}

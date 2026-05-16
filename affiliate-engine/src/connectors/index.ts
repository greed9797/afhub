import type { AffiliatePlatform } from '../types.js';
import type { PlatformConnector } from './base.js';
import { MercadoLivreConnector } from './mercadolivre.js';
import { ShopeeConnector } from './shopee.js';
import { TikTokShopConnector } from './tiktokshop.js';

export function connectorFor(platform: AffiliatePlatform): PlatformConnector {
  if (platform === 'mercadolivre') return new MercadoLivreConnector();
  if (platform === 'shopee') return new ShopeeConnector();
  if (platform === 'tiktokshop') return new TikTokShopConnector();
  throw new Error(`Unsupported affiliate platform: ${platform}`);
}

export const allConnectors: Array<{ platform: AffiliatePlatform; connector: PlatformConnector }> = [
  { platform: 'mercadolivre', connector: new MercadoLivreConnector() },
  { platform: 'shopee', connector: new ShopeeConnector() },
  { platform: 'tiktokshop', connector: new TikTokShopConnector() },
];

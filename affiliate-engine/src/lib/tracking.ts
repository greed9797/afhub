import { publicBaseUrl } from './env.js';

const AFFILIATE_TRACKING_PATH = '/api/r';

function normalizeTrackingBase(): string {
  const fallback = `http://localhost:${process.env.PORT ?? 3001}`;
  const raw =
    process.env.AFFILIATE_TRACKING_BASE_URL ??
    process.env.PUBLIC_API_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    process.env.AFFILIATE_ENGINE_URL ??
    publicBaseUrl() ??
    fallback;

  try {
    const parsed = new URL(raw);
    return `${parsed.origin}${parsed.pathname.replace(/\/+$/, '')}`;
  } catch {
    return fallback;
  }
}

export function buildTrackedAffiliateUrl(affiliatedProductId: string, options: {
  publicationId?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
} = {}): string {
  const base = normalizeTrackingBase();
  const url = new URL(`${base}${AFFILIATE_TRACKING_PATH}/${encodeURIComponent(affiliatedProductId)}`);

  if (options.publicationId) {
    url.searchParams.set('publication_id', options.publicationId);
  }

  if (options.utmSource) {
    url.searchParams.set('utm_source', options.utmSource);
  }

  if (options.utmMedium) {
    url.searchParams.set('utm_medium', options.utmMedium);
  }

  if (options.utmCampaign) {
    url.searchParams.set('utm_campaign', options.utmCampaign);
  }

  return url.toString();
}

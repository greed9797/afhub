import { loadAccountTokens } from '../../connectors/base.js';
import { getSupabase } from '../../lib/supabase.js';

export async function publishToInstagram(params: {
  accountId: string;
  videoUrl: string;
  caption: string;
}): Promise<string> {
  const tokens = await loadAccountTokens(params.accountId);
  const { data: account, error } = await getSupabase()
    .from('affiliate_accounts')
    .select('channel_ids')
    .eq('id', params.accountId)
    .single();
  if (error || !account) throw error ?? new Error('Instagram account not found.');
  const channelIds = account.channel_ids as Record<string, unknown>;
  const igUserId = String(channelIds.instagram_user_id ?? channelIds.instagram ?? '');
  if (!igUserId) throw new Error('Instagram user id is not configured in channel_ids.instagram_user_id.');

  const createParams = new URLSearchParams({
    media_type: 'REELS',
    video_url: params.videoUrl,
    caption: params.caption,
    share_to_feed: 'true',
    access_token: tokens.access_token,
  });
  const createResponse = await fetch(`https://graph.facebook.com/v18.0/${igUserId}/media`, {
    method: 'POST',
    body: createParams,
  });
  const createData = (await createResponse.json()) as Record<string, unknown>;
  if (!createResponse.ok || !createData.id) {
    throw new Error(`Instagram media create failed ${createResponse.status}: ${JSON.stringify(createData).slice(0, 500)}`);
  }

  const publishParams = new URLSearchParams({
    creation_id: String(createData.id),
    access_token: tokens.access_token,
  });
  const publishResponse = await fetch(`https://graph.facebook.com/v18.0/${igUserId}/media_publish`, {
    method: 'POST',
    body: publishParams,
  });
  const publishData = (await publishResponse.json()) as Record<string, unknown>;
  if (!publishResponse.ok || !publishData.id) {
    throw new Error(`Instagram media publish failed ${publishResponse.status}: ${JSON.stringify(publishData).slice(0, 500)}`);
  }
  return String(publishData.id);
}

import { loadAccountTokens } from '../../connectors/base.js';

export async function publishToTikTok(params: {
  accountId: string;
  videoPath: string;
  title: string;
  description: string;
  hashtags: string[];
}): Promise<string> {
  const tokens = await loadAccountTokens(params.accountId);
  const response = await fetch('https://open.tiktokapis.com/v2/post/publish/video/init/', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${tokens.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      post_info: {
        title: params.title,
        privacy_level: 'PUBLIC_TO_EVERYONE',
        disable_duet: false,
        disable_comment: false,
      },
      source_info: {
        source: 'PULL_FROM_URL',
        video_url: params.videoPath,
      },
    }),
  });
  const data = (await response.json()) as Record<string, unknown>;
  if (!response.ok) throw new Error(`TikTok publish failed ${response.status}: ${JSON.stringify(data).slice(0, 500)}`);
  const publishId = (data.data as Record<string, unknown> | undefined)?.publish_id ?? data.publish_id;
  if (!publishId) throw new Error('TikTok publish response did not include publish_id.');
  return waitForTikTokPublish(tokens.access_token, String(publishId));
}

async function waitForTikTokPublish(accessToken: string, publishId: string): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const response = await fetch('https://open.tiktokapis.com/v2/post/publish/status/fetch/', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ publish_id: publishId }),
    });
    const data = (await response.json()) as Record<string, unknown>;
    const status = String((data.data as Record<string, unknown> | undefined)?.status ?? data.status ?? '');
    if (status === 'PUBLISH_COMPLETE' || status === 'SUCCESS') return publishId;
    if (status === 'FAILED' || status === 'spam_risk' || status === 'scope_not_authorized') {
      throw new Error(`TikTok publish status ${status}: ${JSON.stringify(data).slice(0, 500)}`);
    }
    if (!response.ok) throw new Error(`TikTok publish status failed ${response.status}: ${JSON.stringify(data).slice(0, 500)}`);
    await new Promise((resolve) => setTimeout(resolve, 15_000));
  }
  throw new Error('TikTok publish status timed out.');
}

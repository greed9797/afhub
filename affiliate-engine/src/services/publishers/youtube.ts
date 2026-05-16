import { loadAccountTokens } from '../../connectors/base.js';

export async function publishToYouTube(params: {
  accountId: string;
  videoPath: string;
  title: string;
  description: string;
  tags: string[];
}): Promise<string> {
  const tokens = await loadAccountTokens(params.accountId);
  const videoResponse = await fetch(params.videoPath);
  if (!videoResponse.ok) throw new Error(`Could not download video for YouTube upload: ${videoResponse.status}`);
  const videoBytes = await videoResponse.arrayBuffer();

  const metadataResponse = await fetch(
    'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokens.access_token}`,
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Type': 'video/mp4',
        'X-Upload-Content-Length': String(videoBytes.byteLength),
      },
      body: JSON.stringify({
        snippet: {
          title: params.title,
          description: params.description,
          tags: params.tags,
          categoryId: '26',
        },
        status: {
          privacyStatus: 'public',
          madeForKids: false,
        },
      }),
    },
  );

  const uploadUrl = metadataResponse.headers.get('location');
  if (!metadataResponse.ok || !uploadUrl) {
    const text = await metadataResponse.text();
    throw new Error(`YouTube resumable init failed ${metadataResponse.status}: ${text.slice(0, 500)}`);
  }

  const uploadResponse = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': 'video/mp4',
      'Content-Length': String(videoBytes.byteLength),
    },
    body: Buffer.from(videoBytes),
  });
  const data = (await uploadResponse.json()) as Record<string, unknown>;
  if (!uploadResponse.ok) throw new Error(`YouTube upload failed ${uploadResponse.status}: ${JSON.stringify(data).slice(0, 500)}`);
  if (!data.id) throw new Error('YouTube upload response did not include video id.');
  return String(data.id);
}

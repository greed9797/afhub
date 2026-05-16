import { GoogleAuth } from 'google-auth-library';
import { requireEnv } from './env.js';

interface SubmitVeoParams {
  prompt: string;
  imageUrls?: string[];
  aspectRatio?: string;
  durationSeconds?: number;
}

function vertexEndpoint(suffix: string): string {
  const project = requireEnv('GOOGLE_CLOUD_PROJECT');
  const location = process.env.GOOGLE_CLOUD_LOCATION ?? 'us-central1';
  return `https://${location}-aiplatform.googleapis.com/v1/projects/${project}/locations/${location}/publishers/google/models/veo-3.0-generate-preview:${suffix}`;
}

async function accessToken(): Promise<string> {
  const credentials = JSON.parse(requireEnv('GOOGLE_SERVICE_ACCOUNT_JSON')) as Record<string, unknown>;
  const auth = new GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
  });
  const client = await auth.getClient();
  const token = await client.getAccessToken();
  if (!token.token) throw new Error('Could not obtain Google Cloud access token.');
  return token.token;
}

async function imageToBase64(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not fetch reference image: ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  return buffer.toString('base64');
}

export async function submitVeoJob(params: SubmitVeoParams): Promise<string> {
  const imageBytes = await Promise.all((params.imageUrls ?? []).slice(0, 3).map(imageToBase64));
  const instances =
    imageBytes.length > 0
      ? imageBytes.map((bytesBase64Encoded) => ({
          prompt: params.prompt,
          image: { bytesBase64Encoded },
        }))
      : [{ prompt: params.prompt }];

  const response = await fetch(vertexEndpoint('predictLongRunning'), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${await accessToken()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      instances,
      parameters: {
        aspectRatio: params.aspectRatio ?? '9:16',
        sampleCount: 1,
        durationSeconds: params.durationSeconds ?? 8,
      },
    }),
  });

  const data = (await response.json()) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(`Vertex Veo submit failed ${response.status}: ${JSON.stringify(data).slice(0, 500)}`);
  }

  const name = data.name ?? (data.operation as Record<string, unknown> | undefined)?.name;
  if (!name) throw new Error('Vertex Veo submit response did not include an operation name.');
  return String(name);
}

export async function pollVeoOperation(operationName: string): Promise<string | null> {
  const location = process.env.GOOGLE_CLOUD_LOCATION ?? 'us-central1';
  const url = operationName.startsWith('projects/')
    ? `https://${location}-aiplatform.googleapis.com/v1/${operationName}`
    : operationName;
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${await accessToken()}`,
    },
  });
  const data = (await response.json()) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(`Vertex Veo poll failed ${response.status}: ${JSON.stringify(data).slice(0, 500)}`);
  }
  if (!data.done) return null;
  if (data.error) throw new Error(`Vertex Veo operation failed: ${JSON.stringify(data.error).slice(0, 500)}`);

  const responsePayload = data.response as Record<string, unknown> | undefined;
  const predictions = (responsePayload?.predictions ?? responsePayload?.videos ?? []) as Array<Record<string, unknown>>;
  const first = predictions[0] ?? responsePayload;
  const base64 = first?.bytesBase64Encoded ?? first?.videoBytes ?? first?.bytes_base64_encoded;
  if (base64) return `data:video/mp4;base64,${String(base64)}`;
  const uri = first?.gcsUri ?? first?.gcs_uri ?? first?.videoUri ?? first?.uri;
  if (uri) return String(uri);
  throw new Error('Vertex Veo completed but did not include video bytes or URI.');
}

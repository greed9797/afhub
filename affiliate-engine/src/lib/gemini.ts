import { requireEnv } from './env.js';
import type { PublishPlatform, VideoJobType } from '../types.js';

async function generateText(prompt: string): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(requireEnv('GOOGLE_AI_API_KEY'))}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [{ text: prompt }],
        },
      ],
      generationConfig: {
        temperature: 0.7,
      },
    }),
  });
  const data = (await response.json()) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(`Gemini request failed ${response.status}: ${JSON.stringify(data).slice(0, 500)}`);
  }

  const candidates = data.candidates as Array<Record<string, unknown>> | undefined;
  const content = candidates?.[0]?.content as Record<string, unknown> | undefined;
  const parts = content?.parts as Array<Record<string, unknown>> | undefined;
  const text = parts?.map((part) => part.text).filter(Boolean).join('\n');
  if (!text) throw new Error('Gemini response did not include text.');
  return String(text).trim();
}

export async function generateVeoPrompt(params: {
  productName: string;
  productDescription: string;
  niche: string;
  type: VideoJobType;
  price: number;
}): Promise<string> {
  const prompt = [
    'Você é especialista em criar prompts de vídeo para marketing de afiliados no TikTok.',
    'Gere um prompt em INGLÊS, cinematográfico, específico para Veo 3.',
    "Para type='product': foco em detalhes do produto, close-up shots e iluminação de produto.",
    "Para type='lifestyle': cena de uso natural no contexto do nicho, sem mostrar produto explicitamente.",
    'Máximo 500 caracteres. Não inclua texto na tela, logos ou watermarks.',
    '',
    `Produto: ${params.productName}`,
    `Descrição: ${params.productDescription}`,
    `Nicho: ${params.niche}`,
    `Tipo: ${params.type}`,
    `Preço: ${params.price}`,
  ].join('\n');

  return (await generateText(prompt)).slice(0, 500);
}

export async function generatePublicationContent(params: {
  productName: string;
  niche: string;
  price: number;
  platform: PublishPlatform;
  affiliateLink: string;
}): Promise<{ title: string; description: string; hashtags: string[] }> {
  const prompt = [
    'Crie conteúdo de publicação para marketing de afiliados.',
    'Responda SOMENTE JSON válido com chaves title, description, hashtags.',
    'title: máximo 150 caracteres. description: máximo 2200 caracteres. hashtags: array de 15 a 20 strings sem #.',
    'TikTok: tom informal. YouTube: mais descritivo. Instagram: mais visual. Instagram não deve prometer link clicável na caption; use "Link na bio".',
    '',
    `Produto: ${params.productName}`,
    `Nicho: ${params.niche}`,
    `Preço: ${params.price}`,
    `Plataforma: ${params.platform}`,
    `Link afiliado: ${params.affiliateLink}`,
  ].join('\n');

  const raw = await generateText(prompt);
  const json = raw.replace(/^```json/i, '').replace(/^```/, '').replace(/```$/g, '').trim();
  let parsed: { title?: string; description?: string; hashtags?: string[] };
  try {
    parsed = JSON.parse(json) as { title?: string; description?: string; hashtags?: string[] };
  } catch {
    parsed = {
      title: params.productName,
      description: params.platform === 'instagram' ? 'Link na bio' : params.affiliateLink,
      hashtags: ['afiliados', 'oferta', params.niche].filter(Boolean),
    };
  }
  return {
    title: String(parsed.title ?? params.productName).slice(0, 150),
    description: String(parsed.description ?? '').slice(0, 2200),
    hashtags: Array.isArray(parsed.hashtags) ? parsed.hashtags.map(String).slice(0, 20) : [],
  };
}

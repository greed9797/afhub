import { getSupabase } from '../lib/supabase.js';
import type { ProductCandidate } from '../types.js';
import { processDecision } from './approval.js';

export interface TelegramCallbackQuery {
  id: string;
  data?: string;
  message?: {
    chat?: { id?: number | string };
    message_id?: number;
  };
}

interface TelegramUpdate {
  callback_query?: TelegramCallbackQuery;
}

function telegramApiUrl(method: string): string {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN is not configured.');
  return `https://api.telegram.org/bot${token}/${method}`;
}

async function telegramFetch(method: string, body: Record<string, unknown>): Promise<void> {
  if (!process.env.TELEGRAM_BOT_TOKEN || !process.env.TELEGRAM_CHAT_ID) return;
  const response = await fetch(telegramApiUrl(method), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Telegram ${method} failed: ${response.status} ${text.slice(0, 200)}`);
  }
}

export async function sendProductApprovalCard(candidate: ProductCandidate): Promise<void> {
  const caption = [
    'Novo produto para aprovação',
    '',
    `${candidate.nome.slice(0, 120)}`,
    `Plataforma: ${candidate.platform.toUpperCase()}`,
    `Comissão: ${candidate.comissao_percent ?? 0}%${candidate.commission_source === 'estimated' ? ' (estimada)' : ''}`,
    `Vendas/mês: ${(candidate.vendas_mes ?? 0).toLocaleString('pt-BR')}`,
    `Avaliação: ${candidate.avaliacao ?? 0}`,
    `Score: ${candidate.score ?? 0}/100`,
  ].join('\n');

  const reply_markup = {
    inline_keyboard: [
      [
        { text: 'Aprovar', callback_data: `approve:${candidate.id}` },
        { text: 'Rejeitar', callback_data: `reject:${candidate.id}` },
      ],
    ],
  };

  const image = candidate.imagens?.[0];
  if (image) {
    await telegramFetch('sendPhoto', {
      chat_id: process.env.TELEGRAM_CHAT_ID,
      photo: image,
      caption,
      parse_mode: 'HTML',
      reply_markup,
    });
    return;
  }

  await telegramFetch('sendMessage', {
    chat_id: process.env.TELEGRAM_CHAT_ID,
    text: caption,
    parse_mode: 'HTML',
    reply_markup,
  });
}

export async function sendScanSummary(nicheNome: string, total: number, byPlatform: Record<string, number>): Promise<void> {
  const platformLines = Object.entries(byPlatform)
    .map(([platform, count]) => `- ${platform}: ${count}`)
    .join('\n');
  await telegramFetch('sendMessage', {
    chat_id: process.env.TELEGRAM_CHAT_ID,
    text: `Scan concluído - ${nicheNome}\n\nTotal: ${total} produtos\n${platformLines}\n\nAcesse /dashboard/approvals para aprovar.`,
  });
}

export async function handleCallbackQuery(callbackQuery: TelegramCallbackQuery): Promise<void> {
  const [action, candidateId] = String(callbackQuery.data ?? '').split(':');
  if (!candidateId || !['approve', 'reject'].includes(action)) return;

  await processDecision(candidateId, action === 'approve' ? 'approved' : 'rejected', 'telegram');

  if (callbackQuery.message?.chat?.id && callbackQuery.message.message_id) {
    await telegramFetch('editMessageCaption', {
      chat_id: callbackQuery.message.chat.id,
      message_id: callbackQuery.message.message_id,
      caption: `Produto ${action === 'approve' ? 'aprovado' : 'rejeitado'} pelo Telegram.`,
      reply_markup: { inline_keyboard: [[{ text: action === 'approve' ? 'Aprovado' : 'Rejeitado', callback_data: 'done' }]] },
    }).catch(async () => {
      await telegramFetch('editMessageText', {
        chat_id: callbackQuery.message?.chat?.id,
        message_id: callbackQuery.message?.message_id,
        text: `Produto ${action === 'approve' ? 'aprovado' : 'rejeitado'} pelo Telegram.`,
        reply_markup: { inline_keyboard: [[{ text: action === 'approve' ? 'Aprovado' : 'Rejeitado', callback_data: 'done' }]] },
      });
    });
  }
}

export async function handleTelegramUpdate(update: TelegramUpdate): Promise<void> {
  if (update.callback_query) {
    await handleCallbackQuery(update.callback_query);
  }
}

export async function setTelegramWebhook(): Promise<void> {
  if (!process.env.TELEGRAM_BOT_TOKEN || !process.env.TELEGRAM_WEBHOOK_SECRET || !process.env.PUBLIC_API_URL) return;
  await telegramFetch('setWebhook', {
    url: `${process.env.PUBLIC_API_URL}/api/webhooks/telegram`,
    secret_token: process.env.TELEGRAM_WEBHOOK_SECRET,
  });
}

export async function notifyPendingCandidates(limit = 5): Promise<void> {
  const { data, error } = await getSupabase()
    .from('product_candidates')
    .select('*')
    .eq('status', 'pending')
    .order('score', { ascending: false })
    .limit(limit);
  if (error) throw error;
  for (const candidate of (data ?? []) as ProductCandidate[]) {
    await sendProductApprovalCard(candidate);
  }
}

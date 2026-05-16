'use client';

import { useEffect, useState } from 'react';
import { CheckCircle, PaperPlaneTilt, WarningCircle } from '@phosphor-icons/react';
import { apiFetch } from '../_components/api';
import { Card, PageHeader } from '../_components/DashboardChrome';

type EnvStatus = { key: string; configured: boolean };
type Readiness = {
  account_id?: string;
  account_name?: string;
  platform: string;
  country_code: string;
  account_status?: string;
  token_configured?: boolean;
  api_access_status: string;
  capabilities: Record<string, boolean>;
  required_env: string[];
};

export default function SettingsPage() {
  const [env, setEnv] = useState<EnvStatus[]>([]);
  const [readiness, setReadiness] = useState<Readiness[]>([]);
  const [message, setMessage] = useState('');
  const [telegramChatId, setTelegramChatId] = useState('');
  const [slot1, setSlot1] = useState('11:00');
  const [slot2, setSlot2] = useState('19:00');
  const [maxVideos, setMaxVideos] = useState(2);
  const [maxProducts, setMaxProducts] = useState(20);
  const [model, setModel] = useState('veo-3.0-generate-preview');

  useEffect(() => {
    apiFetch<EnvStatus[]>('/settings/env').then(setEnv).catch((err) => setMessage(err.message));
    apiFetch<Readiness[]>('/settings/readiness').then(setReadiness).catch((err) => setMessage(err.message));
  }, []);

  async function testTelegram() {
    await apiFetch('/settings/telegram/test', { method: 'POST' });
    setMessage('Teste enviado para o Telegram.');
  }

  return (
    <>
      <PageHeader title="Settings" description="Configuração operacional do Telegram, horários, limites e checklist de variáveis." />
      {message ? <div className="mb-4 rounded-lg border border-white/10 bg-white/[0.03] p-3 text-sm text-zinc-200">{message}</div> : null}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-3 font-bold">Telegram</h2>
          <input className="input-glass" placeholder="TELEGRAM_CHAT_ID" value={telegramChatId} onChange={(event) => setTelegramChatId(event.target.value)} />
          <button className="btn-primary-sm mt-3" onClick={testTelegram}>
            <PaperPlaneTilt size={15} /> Enviar teste
          </button>
        </Card>
        <Card>
          <h2 className="mb-3 font-bold">Horários de publicação</h2>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="text-xs text-zinc-500">Slot 1<input className="input-glass mt-1" type="time" value={slot1} onChange={(event) => setSlot1(event.target.value)} /></label>
            <label className="text-xs text-zinc-500">Slot 2<input className="input-glass mt-1" type="time" value={slot2} onChange={(event) => setSlot2(event.target.value)} /></label>
          </div>
        </Card>
        <Card>
          <h2 className="mb-3 font-bold">Limites</h2>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="text-xs text-zinc-500">Máx. vídeos/dia por conta<input className="input-glass mt-1" type="number" value={maxVideos} onChange={(event) => setMaxVideos(Number(event.target.value))} /></label>
            <label className="text-xs text-zinc-500">Máx. produtos/dia<input className="input-glass mt-1" type="number" value={maxProducts} onChange={(event) => setMaxProducts(Number(event.target.value))} /></label>
          </div>
        </Card>
        <Card>
          <h2 className="mb-3 font-bold">Modelo de vídeo</h2>
          <select className="select w-full" value={model} onChange={(event) => setModel(event.target.value)}>
            <option value="veo-3.0-generate-preview">Veo 3</option>
            <option value="veo-3.1-generate-preview">Veo 3.1</option>
          </select>
        </Card>
      </div>
      <Card className="mt-4">
        <h2 className="mb-3 font-bold">API Readiness</h2>
        <div className="grid gap-3 lg:grid-cols-3">
          {readiness.map((item) => (
            <div key={item.account_id ?? item.platform} className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="font-semibold capitalize">{item.account_name ?? item.platform}</span>
                <span className={`rounded-full px-2 py-1 text-xs ${item.api_access_status === 'approved' ? 'bg-emerald-500/15 text-emerald-300' : item.api_access_status === 'missing' ? 'bg-red-500/15 text-red-300' : 'bg-amber-500/15 text-amber-300'}`}>
                  {item.api_access_status}
                </span>
              </div>
              <p className="mb-2 text-xs text-zinc-500">
                {item.platform} · {item.country_code}{item.account_status ? ` · ${item.account_status}` : ''}
              </p>
              {typeof item.token_configured === 'boolean' ? (
                <p className="mb-2 text-xs text-zinc-400">OAuth: {item.token_configured ? 'conectado' : 'pendente'}</p>
              ) : null}
              <div className="mb-3 grid gap-1 text-xs text-zinc-300">
                {Object.entries(item.capabilities).map(([key, value]) => (
                  <span key={key} className="flex items-center justify-between">
                    {key.replace('can_', '')}
                    {value ? <CheckCircle size={15} weight="fill" className="text-emerald-400" /> : <WarningCircle size={15} weight="fill" className="text-amber-400" />}
                  </span>
                ))}
              </div>
              <div className="space-y-1 text-[11px] text-zinc-500">
                {item.required_env.map((key) => (
                  <div key={key} className="font-mono">{key}</div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Card>
      <Card className="mt-4">
        <h2 className="mb-3 font-bold">Variáveis de ambiente</h2>
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {env.map((item) => (
            <div key={item.key} className="flex items-center justify-between rounded-lg bg-white/[0.03] px-3 py-2 text-sm">
              <span className="font-mono text-xs">{item.key}</span>
              {item.configured ? <CheckCircle size={18} weight="fill" className="text-emerald-400" /> : <WarningCircle size={18} weight="fill" className="text-amber-400" />}
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}

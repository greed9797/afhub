'use client';

import { useEffect, useMemo, useState } from 'react';
import { Check, X } from '@phosphor-icons/react';
import { apiFetch } from '../_components/api';
import { Card, EmptyState, PageHeader, PlatformBadge } from '../_components/DashboardChrome';

type Candidate = {
  id: string;
  nome: string;
  platform: string;
  imagens?: string[];
  comissao_percent: number;
  vendas_mes: number;
  avaliacao: number;
  score: number;
};

function scoreColor(score: number) {
  if (score > 70) return 'border-emerald-400 text-emerald-300';
  if (score >= 40) return 'border-amber-400 text-amber-300';
  return 'border-rose-400 text-rose-300';
}

export default function ApprovalsPage() {
  const [items, setItems] = useState<Candidate[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [platform, setPlatform] = useState('');
  const [error, setError] = useState('');

  async function load() {
    const query = platform ? `?platform=${platform}` : '';
    const response = await apiFetch<{ data?: Candidate[] } | Candidate[]>(`/approvals${query}`);
    setItems(Array.isArray(response) ? response : response.data ?? []);
  }

  useEffect(() => {
    load().catch((err) => setError(err.message));
    const timer = window.setInterval(() => load().catch((err) => setError(err.message)), 30_000);
    return () => window.clearInterval(timer);
  }, [platform]);

  const selectedCount = useMemo(() => selected.length, [selected]);

  async function decide(id: string, decision: 'approve' | 'reject') {
    await apiFetch(`/approvals/${id}/${decision}`, { method: 'POST' });
    setSelected((current) => current.filter((itemId) => itemId !== id));
    await load();
  }

  async function batch(decision: 'approved' | 'rejected') {
    await apiFetch('/approvals/batch', { method: 'POST', body: JSON.stringify({ ids: selected, decision }) });
    setSelected([]);
    await load();
  }

  return (
    <>
      <PageHeader
        title="Aprovações"
        description="Aprove somente os produtos que você quer afiliar antes de gerar links, vídeos e publicações."
        action={
          <div className="flex gap-2">
            <select className="select" value={platform} onChange={(event) => setPlatform(event.target.value)}>
              <option value="">Todas</option>
              <option value="mercadolivre">Mercado Livre</option>
              <option value="shopee">Shopee</option>
              <option value="tiktokshop">TikTok Shop</option>
            </select>
            <button className="btn-primary-sm" disabled={!selectedCount} onClick={() => batch('approved')}>
              Aprovar selecionados ({selectedCount})
            </button>
          </div>
        }
      />
      {error ? <div className="mb-4 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">{error}</div> : null}
      {items.length ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {items.map((item) => (
            <Card key={item.id} className="overflow-hidden p-0">
              <div className="aspect-[4/3] bg-zinc-900">
                {item.imagens?.[0] ? <img src={item.imagens[0]} alt="" className="h-full w-full object-cover" /> : null}
              </div>
              <div className="p-4">
                <div className="mb-3 flex items-center justify-between">
                  <PlatformBadge value={item.platform} />
                  <input
                    type="checkbox"
                    checked={selected.includes(item.id)}
                    onChange={(event) =>
                      setSelected((current) => (event.target.checked ? [...current, item.id] : current.filter((id) => id !== item.id)))
                    }
                  />
                </div>
                <h2 className="line-clamp-2 min-h-[40px] text-sm font-bold">{item.nome}</h2>
                <div className="mt-3 flex items-center justify-between text-xs text-zinc-300">
                  <span>R$ {item.comissao_percent}%</span>
                  <span>{item.vendas_mes}/mês</span>
                  <span>{item.avaliacao}</span>
                </div>
                <div className="mt-4 flex items-center justify-between">
                  <span className={`grid h-12 w-12 place-items-center rounded-full border text-sm font-black ${scoreColor(item.score)}`}>{item.score}</span>
                  <div className="flex gap-2">
                    <button className="btn-primary-sm" onClick={() => decide(item.id, 'approve')}><Check size={15} /> Aprovar</button>
                    <button className="btn-glass-pill text-rose-300" onClick={() => decide(item.id, 'reject')}><X size={15} /> Rejeitar</button>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState>Nenhum produto pendente. Execute um scan para buscar produtos.</EmptyState>
      )}
    </>
  );
}

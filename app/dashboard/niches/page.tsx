'use client';

import { useEffect, useState } from 'react';
import { Plus } from '@phosphor-icons/react';
import { apiFetch } from '../_components/api';
import { Card, EmptyState, PageHeader, StatusBadge } from '../_components/DashboardChrome';

type Niche = {
  id: string;
  nome: string;
  keywords: string[];
  active: boolean;
  filters?: Record<string, number>;
};

const defaultFilters = { comissao_min: 5, vendas_min: 100, preco_min: 30, preco_max: 500, avaliacao_min: 4 };

export default function NichesPage() {
  const [niches, setNiches] = useState<Niche[]>([]);
  const [nome, setNome] = useState('');
  const [keywords, setKeywords] = useState('');
  const [error, setError] = useState('');

  async function load() {
    setNiches(await apiFetch<Niche[]>('/niches'));
  }

  useEffect(() => {
    load().catch((err) => setError(err.message));
  }, []);

  async function createNiche() {
    await apiFetch('/niches', {
      method: 'POST',
      body: JSON.stringify({
        nome,
        keywords: keywords.split(',').map((keyword) => keyword.trim()).filter(Boolean),
        filters: defaultFilters,
      }),
    });
    setNome('');
    setKeywords('');
    await load();
  }

  async function patchNiche(niche: Niche, patch: Record<string, unknown>) {
    await apiFetch(`/niches/${niche.id}`, { method: 'PATCH', body: JSON.stringify(patch) });
    await load();
  }

  return (
    <>
      <PageHeader title="Nichos" description="Defina palavras-chave e filtros usados pelo scanner de produtos." />
      {error ? <div className="mb-4 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">{error}</div> : null}
      <Card className="mb-5">
        <div className="grid gap-3 md:grid-cols-[220px_1fr_auto]">
          <input className="input-glass" placeholder="Moda feminina" value={nome} onChange={(event) => setNome(event.target.value)} />
          <input className="input-glass" placeholder="vestido, look, verão" value={keywords} onChange={(event) => setKeywords(event.target.value)} />
          <button className="btn-primary-sm justify-center" onClick={createNiche}>
            <Plus size={15} /> Criar nicho
          </button>
        </div>
      </Card>

      {niches.length ? (
        <div className="grid gap-4 md:grid-cols-2">
          {niches.map((niche) => (
            <Card key={niche.id}>
              <div className="flex items-center justify-between">
                <h2 className="font-bold">{niche.nome}</h2>
                <StatusBadge value={niche.active ? 'active' : 'paused'} />
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {niche.keywords.map((keyword) => (
                  <span key={keyword} className="rounded-full bg-white/5 px-2 py-1 text-xs text-zinc-300">
                    {keyword}
                  </span>
                ))}
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-5">
                {Object.entries({ ...defaultFilters, ...(niche.filters ?? {}) }).map(([key, value]) => (
                  <label key={key} className="text-[11px] text-zinc-500">
                    {key}
                    <input
                      className="input-glass mt-1"
                      type="number"
                      defaultValue={value}
                      onBlur={(event) =>
                        patchNiche(niche, {
                          filters: { ...(niche.filters ?? defaultFilters), [key]: Number(event.target.value) },
                        })
                      }
                    />
                  </label>
                ))}
              </div>
              <button className="btn-glass-pill mt-4" onClick={() => patchNiche(niche, { active: !niche.active })}>
                {niche.active ? 'Pausar' : 'Ativar'}
              </button>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState>Nenhum nicho cadastrado.</EmptyState>
      )}
    </>
  );
}

'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, MagnifyingGlass } from '@phosphor-icons/react';
import { apiFetch, formatCurrency } from '../_components/api';
import { Card, EmptyState, PageHeader, PlatformBadge, StatusBadge } from '../_components/DashboardChrome';

type Niche = { id: string; nome: string; active: boolean; filters?: Record<string, number> };
type Candidate = {
  id: string;
  nome: string;
  platform: string;
  seller_id: string;
  comissao_percent: number;
  vendas_mes: number;
  preco: number;
  score: number;
  status: string;
};

export default function ScannerPage() {
  const [niches, setNiches] = useState<Niche[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [results, setResults] = useState<Candidate[]>([]);
  const [jobId, setJobId] = useState('');
  const [jobStatus, setJobStatus] = useState('');
  const [error, setError] = useState('');

  async function load() {
    const [nichesData, resultsData] = await Promise.all([
      apiFetch<Niche[]>('/niches'),
      apiFetch<{ data?: Candidate[] } | Candidate[]>('/scanner/results?limit=50'),
    ]);
    setNiches(nichesData);
    setResults(Array.isArray(resultsData) ? resultsData : resultsData.data ?? []);
  }

  useEffect(() => {
    load().catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    if (!jobId || jobStatus === 'done' || jobStatus === 'failed') return undefined;
    const timer = window.setInterval(async () => {
      const status = await apiFetch<{ status: string; result?: unknown; error?: string }>(`/scanner/status/${jobId}`);
      setJobStatus(status.status);
      if (status.status === 'done') await load();
      if (status.status === 'failed') setError(status.error ?? 'Scan falhou.');
    }, 2500);
    return () => window.clearInterval(timer);
  }, [jobId, jobStatus]);

  async function runScan() {
    setError('');
    const response = await apiFetch<{ id: string; status: string }>('/scanner/run', {
      method: 'POST',
      body: JSON.stringify({ nicheIds: selected }),
    });
    setJobId(response.id);
    setJobStatus(response.status);
  }

  return (
    <>
      <PageHeader
        title="Scanner"
        description="Busque produtos por nicho nas plataformas e traga os melhores candidatos por comissão, vendas e avaliação."
        action={
          <Link href="/dashboard/approvals" className="btn-glass-pill">
            Ir para Aprovações <ArrowRight size={15} />
          </Link>
        }
      />
      {error ? <div className="mb-4 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">{error}</div> : null}
      <Card className="mb-5">
        <div className="mb-4 flex flex-wrap gap-3">
          {niches.filter((niche) => niche.active).map((niche) => (
            <label key={niche.id} className="flex items-start gap-2 rounded-lg border border-white/10 px-3 py-2 text-sm">
              <input
                className="mt-1"
                type="checkbox"
                checked={selected.includes(niche.id)}
                onChange={(event) =>
                  setSelected((current) => (event.target.checked ? [...current, niche.id] : current.filter((id) => id !== niche.id)))
                }
              />
              <span>
                <span className="block font-medium">{niche.nome}</span>
                {niche.filters ? (
                  <span className="mt-1 block text-[11px] text-zinc-500">
                    Comissão {niche.filters.comissao_min ?? 5}% · Vendas {niche.filters.vendas_min ?? 100} · Avaliação {niche.filters.avaliacao_min ?? 4}
                  </span>
                ) : null}
              </span>
            </label>
          ))}
        </div>
        <button className="btn-primary-sm" disabled={!selected.length || jobStatus === 'running'} onClick={runScan}>
          <MagnifyingGlass size={15} /> {jobStatus === 'running' ? 'Escaneando...' : 'Iniciar Scan'}
        </button>
        {jobId ? <span className="ml-3 text-xs text-zinc-500">Job {jobStatus}: {jobId}</span> : null}
      </Card>

      <Card>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-bold">Resultados pendentes</h2>
          <span className="text-xs text-zinc-500">{results.length} produtos</span>
        </div>
        {results.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="text-xs text-zinc-500">
                <tr>
                  <th className="py-2">Produto</th>
                  <th>Plataforma</th>
                  <th>Seller</th>
                  <th>Preço</th>
                  <th>Comissão</th>
                  <th>Vendas/mês</th>
                  <th>Score</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {results.map((item) => (
                  <tr key={item.id}>
                    <td className="max-w-[320px] py-3">{item.nome}</td>
                    <td><PlatformBadge value={item.platform} /></td>
                    <td className="text-zinc-400">{item.seller_id}</td>
                    <td>{formatCurrency(item.preco)}</td>
                    <td>{item.comissao_percent}%</td>
                    <td>{item.vendas_mes}</td>
                    <td className="font-bold text-primary">{item.score}</td>
                    <td><StatusBadge value={item.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState>Nenhum resultado. Execute um scan para buscar produtos.</EmptyState>
        )}
      </Card>
    </>
  );
}

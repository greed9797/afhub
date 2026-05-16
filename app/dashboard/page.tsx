'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, CheckCircle, Clock, PlayCircle, ShoppingBagOpen, UsersThree } from '@phosphor-icons/react';
import { apiFetch, formatCurrency, formatDate } from './_components/api';
import { Card, EmptyState, PageHeader, PlatformBadge, StatusBadge } from './_components/DashboardChrome';

type Account = { id: string; status: string };
type Candidate = { id: string; nome: string; platform: string; score: number };
type VideoJob = { id: string; status: string; type: string; created_at: string; affiliated_products?: { product_candidates?: { nome?: string } } };
type Publication = { id: string; publish_platform: string; scheduled_for: string; status: string; video_jobs?: { affiliated_products?: { product_candidates?: { nome?: string } } } };
type Product = { id: string };
type AnalyticsTotals = {
  totals: {
    impressions: number;
    clicks: number;
    orders: number;
    gmv: number;
    commission: number;
    ctr: number;
    conversionRate: number;
    averageOrderValue: number;
    epc: number;
  };
};

const emptyAnalytics: AnalyticsTotals = {
  totals: { impressions: 0, clicks: 0, orders: 0, gmv: 0, commission: 0, ctr: 0, conversionRate: 0, averageOrderValue: 0, epc: 0 },
};

export default function DashboardOverview() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [videos, setVideos] = useState<VideoJob[]>([]);
  const [publications, setPublications] = useState<Publication[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsTotals>(emptyAnalytics);
  const [error, setError] = useState('');

  useEffect(() => {
    const now = new Date();
    const from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29).toISOString();
    const to = now.toISOString();
    Promise.all([
      apiFetch<Account[]>('/accounts'),
      apiFetch<{ data?: Candidate[] } | Candidate[]>('/approvals?limit=3'),
      apiFetch<VideoJob[]>('/videos'),
      apiFetch<Publication[]>('/publications'),
      apiFetch<Product[]>('/products'),
      apiFetch<AnalyticsTotals>(`/analytics/summary?from=${encodeURIComponent(from.slice(0, 10))}&to=${encodeURIComponent(to.slice(0, 10))}&platform=all&account_id=all`),
    ])
      .then(([accountsData, approvalData, videosData, publicationsData, productsData, analyticsData]) => {
        setAccounts(accountsData);
        setCandidates(Array.isArray(approvalData) ? approvalData : approvalData.data ?? []);
        setVideos(videosData);
        setPublications(publicationsData);
        setProducts(productsData);
        setAnalytics(analyticsData);
      })
      .catch((err) => setError(err.message));
  }, []);

  const metrics = [
    { label: 'GMV 30 dias', value: formatCurrency(analytics.totals.gmv), icon: ShoppingBagOpen },
    { label: 'CTR 30 dias', value: `${analytics.totals.ctr.toFixed(2)}%`, icon: UsersThree },
    { label: 'Conversão 30 dias', value: `${analytics.totals.conversionRate.toFixed(2)}%`, icon: CheckCircle },
    { label: 'Pedidos 30 dias', value: analytics.totals.orders.toString(), icon: PlayCircle },
  ];

  return (
    <>
      <PageHeader
        title="AfiliadoOS"
        description="Operação de afiliados com scanner por nicho, fila de aprovação, geração de vídeo em massa e publicação multi-plataforma."
      />
      {error ? <div className="mb-4 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">{error}</div> : null}
      <div className="grid gap-3 md:grid-cols-4">
        {metrics.map((metric) => {
          const Icon = metric.icon;
          return (
            <Card key={metric.label}>
              <div className="flex items-center justify-between">
                <span className="text-sm text-zinc-400">{metric.label}</span>
                <Icon size={18} className="text-primary" />
              </div>
              <div className="mt-3 text-3xl font-black">{metric.value}</div>
            </Card>
          );
        })}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-bold">Fila de aprovação</h2>
            <Link href="/dashboard/approvals" className="flex items-center gap-1 text-xs text-primary">
              Ver todos <ArrowRight size={14} />
            </Link>
          </div>
          <div className="space-y-3">
            {candidates.length ? (
              candidates.slice(0, 3).map((candidate) => (
                <div key={candidate.id} className="rounded-lg bg-white/[0.03] p-3">
                  <div className="line-clamp-2 text-sm">{candidate.nome}</div>
                  <div className="mt-2 flex items-center justify-between">
                    <PlatformBadge value={candidate.platform} />
                    <span className="text-xs text-zinc-400">Score {candidate.score}</span>
                  </div>
                </div>
              ))
            ) : (
              <EmptyState>Nenhum produto pendente.</EmptyState>
            )}
          </div>
        </Card>

        <Card>
          <div className="mb-3 flex items-center gap-2">
            <Clock size={16} className="text-primary" />
            <h2 className="text-sm font-bold">Vídeos gerando agora</h2>
          </div>
          <div className="space-y-3">
            {videos.filter((video) => video.status === 'generating').length ? (
              videos
                .filter((video) => video.status === 'generating')
                .slice(0, 5)
                .map((video) => (
                  <div key={video.id} className="flex items-center justify-between rounded-lg bg-white/[0.03] p-3 text-sm">
                    <span>{video.affiliated_products?.product_candidates?.nome ?? video.type}</span>
                    <StatusBadge value={video.status} />
                  </div>
                ))
            ) : (
              <EmptyState>Nenhum vídeo gerando.</EmptyState>
            )}
          </div>
        </Card>

        <Card>
          <h2 className="mb-3 text-sm font-bold">Próximas publicações</h2>
          <div className="space-y-3">
            {publications.filter((publication) => publication.status === 'scheduled').length ? (
              publications
                .filter((publication) => publication.status === 'scheduled')
                .slice(0, 6)
                .map((publication) => (
                  <div key={publication.id} className="rounded-lg bg-white/[0.03] p-3 text-sm">
                    <div>{publication.video_jobs?.affiliated_products?.product_candidates?.nome ?? publication.publish_platform}</div>
                    <div className="mt-2 flex items-center justify-between text-xs text-zinc-400">
                      <span>{formatDate(publication.scheduled_for)}</span>
                      <span>{publication.publish_platform}</span>
                    </div>
                  </div>
                ))
            ) : (
              <EmptyState>Nenhum slot agendado.</EmptyState>
            )}
          </div>
        </Card>
      </div>
    </>
  );
}

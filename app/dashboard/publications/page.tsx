'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowClockwise, CalendarBlank, ListBullets } from '@phosphor-icons/react';
import { apiFetch, formatDate } from '../_components/api';
import { Card, EmptyState, PageHeader, StatusBadge } from '../_components/DashboardChrome';

type Publication = {
  id: string;
  publish_platform: string;
  status: string;
  title?: string;
  description?: string;
  scheduled_for?: string;
  published_at?: string;
  error_message?: string;
  video_jobs?: { video_url?: string; affiliated_products?: { product_candidates?: { nome?: string; imagens?: string[] } } };
};

export default function PublicationsPage() {
  const [items, setItems] = useState<Publication[]>([]);
  const [view, setView] = useState<'calendar' | 'list'>('calendar');
  const [platform, setPlatform] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  async function load() {
    const params = new URLSearchParams();
    if (platform) params.set('platform', platform);
    if (status) params.set('status', status);
    setItems(await apiFetch<Publication[]>(`/publications${params.size ? `?${params.toString()}` : ''}`));
  }

  useEffect(() => {
    load().catch((err) => setError(err.message));
  }, [platform, status]);

  const metrics = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return {
      published: items.filter((item) => item.published_at?.startsWith(today)).length,
      scheduled: items.filter((item) => item.status === 'scheduled').length,
      failed: items.filter((item) => item.status === 'failed').length,
    };
  }, [items]);

  const grouped = useMemo(() => {
    const map = new Map<string, Publication[]>();
    items.forEach((item) => {
      const day = (item.scheduled_for ?? item.published_at ?? '').slice(0, 10) || 'sem-data';
      map.set(day, [...(map.get(day) ?? []), item]);
    });
    return [...map.entries()];
  }, [items]);

  async function retry(item: Publication) {
    await apiFetch(`/publications/${item.id}/retry`, { method: 'POST' });
    await load();
  }

  return (
    <>
      <PageHeader
        title="Publicações"
        description="Calendário e lista de posts agendados/publicados por canal."
        action={
          <div className="flex flex-wrap gap-2">
            <span className="badge-soft">{metrics.published} publicados hoje</span>
            <span className="badge-running">{metrics.scheduled} agendados</span>
            <span className="badge-failed">{metrics.failed} falhas</span>
          </div>
        }
      />
      {error ? <div className="mb-4 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">{error}</div> : null}
      <Card className="mb-5">
        <div className="flex flex-wrap gap-3">
          <button className={view === 'calendar' ? 'btn-primary-sm' : 'btn-glass-pill'} onClick={() => setView('calendar')}>
            <CalendarBlank size={15} /> Calendário
          </button>
          <button className={view === 'list' ? 'btn-primary-sm' : 'btn-glass-pill'} onClick={() => setView('list')}>
            <ListBullets size={15} /> Lista
          </button>
          <select className="select" value={platform} onChange={(event) => setPlatform(event.target.value)}>
            <option value="">Todas plataformas</option>
            <option value="tiktok">TikTok</option>
            <option value="youtube">YouTube</option>
            <option value="instagram">Instagram</option>
          </select>
          <select className="select" value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="">Todos status</option>
            <option value="scheduled">scheduled</option>
            <option value="published">published</option>
            <option value="failed">failed</option>
          </select>
        </div>
      </Card>

      {!items.length ? <EmptyState>Nenhuma publicação encontrada.</EmptyState> : null}
      {view === 'calendar' ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {grouped.map(([day, publications]) => (
            <Card key={day}>
              <h2 className="mb-3 font-bold">{day}</h2>
              <div className="space-y-3">
                {publications.map((item) => (
                  <div key={item.id} className="rounded-lg bg-white/[0.03] p-3 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold">{item.publish_platform}</span>
                      <StatusBadge value={item.status} />
                    </div>
                    <p className="mt-2 line-clamp-2 text-zinc-300">{item.title || item.video_jobs?.affiliated_products?.product_candidates?.nome}</p>
                    <p className="mt-1 text-xs text-zinc-500">{formatDate(item.scheduled_for)}</p>
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <Card key={item.id}>
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-white/5 px-2 py-1 text-xs">{item.publish_platform}</span>
                    <StatusBadge value={item.status} />
                  </div>
                  <h2 className="mt-2 font-bold">{item.title ?? item.video_jobs?.affiliated_products?.product_candidates?.nome}</h2>
                  <p className="text-xs text-zinc-500">{formatDate(item.scheduled_for)}</p>
                  {item.error_message ? <p className="mt-1 text-sm text-rose-300">{item.error_message}</p> : null}
                </div>
                {item.status === 'failed' ? (
                  <button className="btn-primary-sm" onClick={() => retry(item)}>
                    <ArrowClockwise size={15} /> Retentar
                  </button>
                ) : null}
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}

'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowClockwise } from '@phosphor-icons/react';
import { apiFetch, formatDate } from '../_components/api';
import { Card, EmptyState, PageHeader, StatusBadge } from '../_components/DashboardChrome';

type VideoJob = {
  id: string;
  type: string;
  status: string;
  prompt?: string;
  video_url?: string;
  error_message?: string;
  created_at: string;
  completed_at?: string;
  affiliated_products?: { product_candidates?: { nome?: string } };
};

export default function VideosPage() {
  const [videos, setVideos] = useState<VideoJob[]>([]);
  const [status, setStatus] = useState('');
  const [type, setType] = useState('');
  const [error, setError] = useState('');

  async function load() {
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (type) params.set('type', type);
    setVideos(await apiFetch<VideoJob[]>(`/videos${params.size ? `?${params.toString()}` : ''}`));
  }

  useEffect(() => {
    load().catch((err) => setError(err.message));
  }, [status, type]);

  const generating = useMemo(() => videos.filter((video) => video.status === 'generating').length, [videos]);
  const doneToday = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return videos.filter((video) => video.status === 'done' && video.completed_at?.startsWith(today)).length;
  }, [videos]);

  async function retry(video: VideoJob) {
    await apiFetch(`/videos/${video.id}/retry`, { method: 'POST' });
    await load();
  }

  return (
    <>
      <PageHeader
        title="Vídeos"
        description="Monitore prompts, geração via Veo e arquivos finais para Shorts/Reels/TikTok."
        action={
          <div className="flex gap-2">
            <span className="badge-running">{generating} gerando agora</span>
            <span className="badge-soft">{doneToday} concluídos hoje</span>
          </div>
        }
      />
      {error ? <div className="mb-4 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">{error}</div> : null}
      <Card className="mb-5">
        <div className="flex flex-wrap gap-3">
          <select className="select" value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="">Todos status</option>
            <option value="queued">queued</option>
            <option value="generating">generating</option>
            <option value="done">done</option>
            <option value="failed">failed</option>
          </select>
          <select className="select" value={type} onChange={(event) => setType(event.target.value)}>
            <option value="">Todos tipos</option>
            <option value="product">product</option>
            <option value="lifestyle">lifestyle</option>
          </select>
        </div>
      </Card>

      {videos.length ? (
        <div className="space-y-4">
          {videos.map((video) => (
            <Card key={video.id}>
              <div className="grid gap-4 lg:grid-cols-[220px_1fr_auto]">
                <div className="aspect-[9/16] max-h-[260px] overflow-hidden rounded-lg bg-zinc-900">
                  {video.video_url ? <video src={video.video_url} controls className="h-full w-full object-cover" /> : null}
                </div>
                <div>
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <StatusBadge value={video.status} />
                    <span className="rounded-full bg-white/5 px-2 py-1 text-xs">{video.type}</span>
                  </div>
                  <h2 className="font-bold">{video.affiliated_products?.product_candidates?.nome ?? video.id}</h2>
                  <p className="mt-3 line-clamp-4 text-sm text-zinc-400">{video.prompt ?? '-'}</p>
                  {video.error_message ? <p className="mt-2 text-sm text-rose-300">{video.error_message}</p> : null}
                  <div className="mt-3 text-xs text-zinc-500">
                    Criado: {formatDate(video.created_at)} · Concluído: {formatDate(video.completed_at)}
                  </div>
                </div>
                {video.status === 'failed' ? (
                  <button className="btn-primary-sm h-fit" onClick={() => retry(video)}>
                    <ArrowClockwise size={15} /> Retentar
                  </button>
                ) : null}
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState>Nenhum vídeo encontrado.</EmptyState>
      )}
    </>
  );
}

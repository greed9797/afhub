'use client';

import { useEffect, useState } from 'react';
import { apiFetch, formatDate } from '../_components/api';
import { Card, EmptyState, PageHeader, PlatformBadge, StatusBadge } from '../_components/DashboardChrome';

type Product = {
  id: string;
  affiliate_link: string;
  platform: string;
  status: string;
  affiliated_at: string;
  imagens_storage?: string[];
  product_candidates?: { nome?: string; comissao_percent?: number; vendas_mes?: number };
  affiliate_accounts?: { nome?: string };
};

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch<Product[]>('/products').then(setProducts).catch((err) => setError(err.message));
  }, []);

  return (
    <>
      <PageHeader title="Produtos Afiliados" description="Produtos aprovados, afiliados e prontos para geração de vídeos." />
      {error ? <div className="mb-4 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">{error}</div> : null}
      {products.length ? (
        <div className="grid gap-4 md:grid-cols-2">
          {products.map((product) => (
            <Card key={product.id}>
              <div className="flex gap-4">
                <div className="h-24 w-24 shrink-0 overflow-hidden rounded-lg bg-zinc-900">
                  {product.imagens_storage?.[0] ? <img src={product.imagens_storage[0]} alt="" className="h-full w-full object-cover" /> : null}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <PlatformBadge value={product.platform} />
                    <StatusBadge value={product.status} />
                  </div>
                  <h2 className="mt-2 line-clamp-2 font-bold">{product.product_candidates?.nome ?? product.id}</h2>
                  <p className="mt-1 text-xs text-zinc-500">Conta: {product.affiliate_accounts?.nome ?? '-'}</p>
                  <p className="mt-1 text-xs text-zinc-500">Afiliado em {formatDate(product.affiliated_at)}</p>
                </div>
              </div>
              <a className="mt-3 block truncate rounded-lg bg-white/[0.03] p-2 text-xs text-primary" href={product.affiliate_link} target="_blank">
                {product.affiliate_link}
              </a>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState>Nenhum produto afiliado ainda.</EmptyState>
      )}
    </>
  );
}

'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  ArrowsClockwise,
  CalendarCheck,
  CaretDown,
  ChartLine,
  CurrencyCircleDollar,
  TrendUp,
  UserCircle,
} from '@phosphor-icons/react';
import { apiFetch, formatCurrency } from '../_components/api';
import { Card, EmptyState, PageHeader, PlatformBadge } from '../_components/DashboardChrome';

type AnalyticsSummary = {
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
  byAccount: Array<{
    accountId: string;
    accountName: string;
    platform: string;
    clicks: number;
    orders: number;
    gmv: number;
    commission: number;
    ctr: number;
    conversionRate: number;
  }>;
  byDay: Array<{
    date: string;
    impressions: number;
    clicks: number;
    orders: number;
    gmv: number;
    commission: number;
  }>;
  topProducts: Array<{
    productId: string;
    name: string;
    accountName: string;
    clicks: number;
    orders: number;
    gmv: number;
    conversionRate: number;
  }>;
};

type Account = {
  id: string;
  nome: string;
};

type Period = 'today' | '7d' | '30d' | 'month' | 'custom';

type DateFilterState = {
  period: Period;
  from: string;
  to: string;
  accountId: string;
  platform: string;
};

function todayDate(now: Date): string {
  return now.toISOString().slice(0, 10);
}

function toDateRange(period: Period, now: Date): { from: string; to: string } {
  if (period === 'today') {
    const day = todayDate(now);
    return { from: day, to: day };
  }
  if (period === '7d') {
    const to = todayDate(now);
    const fromDate = new Date(now);
    fromDate.setDate(now.getDate() - 6);
    return { from: todayDate(fromDate), to };
  }
  if (period === '30d') {
    const to = todayDate(now);
    const fromDate = new Date(now);
    fromDate.setDate(now.getDate() - 29);
    return { from: todayDate(fromDate), to };
  }
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  return { from: monthStart, to: todayDate(now) };
}

const zeroSummary: AnalyticsSummary = {
  totals: { impressions: 0, clicks: 0, orders: 0, gmv: 0, commission: 0, ctr: 0, conversionRate: 0, averageOrderValue: 0, epc: 0 },
  byAccount: [],
  byDay: [],
  topProducts: [],
};

export default function AnalyticsDashboard() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [summary, setSummary] = useState<AnalyticsSummary>(zeroSummary);
  const [filters, setFilters] = useState<DateFilterState>(() => {
    const now = new Date();
    const range = toDateRange('30d', now);
    return { period: '30d', from: range.from, to: range.to, accountId: 'all', platform: 'all' };
  });
  const [error, setError] = useState('');

  const resolvedRange = useMemo(() => {
    if (filters.period !== 'custom') {
      const now = new Date();
      return toDateRange(filters.period, now);
    }
    return { from: filters.from, to: filters.to };
  }, [filters]);

  useEffect(() => {
    apiFetch<Account[]>('/accounts')
      .then((rows) => {
        setAccounts(rows);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const params = new URLSearchParams({
      platform: filters.platform,
      account_id: filters.accountId,
      from: filters.period === 'custom' ? filters.from : resolvedRange.from,
      to: filters.period === 'custom' ? filters.to : resolvedRange.to,
    });
    apiFetch<AnalyticsSummary>(`/analytics/summary?${params.toString()}`)
      .then(setSummary)
      .catch((err) => setError(err.message));
  }, [resolvedRange.from, resolvedRange.to, filters.accountId, filters.platform]);

  const dayMax = useMemo(() => {
    const topValue = summary.byDay.reduce((current, item) => Math.max(current, item.clicks), 0);
    return Math.max(topValue, 1);
  }, [summary.byDay]);

  return (
    <>
      <PageHeader title="Analytics" description="Performance consolidada de cliques, conversão, comissão e GMV por conta e produto." />
      {error ? <div className="mb-4 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">{error}</div> : null}

      <Card className="mb-4">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <label className="flex flex-col gap-1 text-xs text-zinc-400">
            Período
            <select
              className="select"
              value={filters.period}
              onChange={(event) => {
                const period = event.target.value as Period;
                const now = new Date();
                const range = toDateRange(period, now);
                setFilters((previous) => ({ ...previous, period, from: period === 'custom' ? previous.from : range.from, to: period === 'custom' ? previous.to : range.to }));
              }}
            >
              <option value="today">Hoje</option>
              <option value="7d">Últimos 7 dias</option>
              <option value="30d">Últimos 30 dias</option>
              <option value="month">Mês atual</option>
              <option value="custom">Personalizado</option>
            </select>
          </label>

          <label className="flex flex-col gap-1 text-xs text-zinc-400">
            Conta
            <select className="select" value={filters.accountId} onChange={(event) => setFilters((previous) => ({ ...previous, accountId: event.target.value }))}>
              <option value="all">Todas</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.nome}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-xs text-zinc-400">
            Plataforma
            <select className="select" value={filters.platform} onChange={(event) => setFilters((previous) => ({ ...previous, platform: event.target.value }))}>
              <option value="all">Todas</option>
              <option value="mercadolivre">Mercado Livre</option>
              <option value="shopee">Shopee</option>
              <option value="tiktokshop">TikTok Shop</option>
            </select>
          </label>

          {filters.period === 'custom' ? (
            <>
              <label className="flex flex-col gap-1 text-xs text-zinc-400">
                De
                <input
                  className="input-glass"
                  type="date"
                  value={filters.from}
                  onChange={(event) => setFilters((previous) => ({ ...previous, from: event.target.value }))}
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-zinc-400">
                Até
                <input
                  className="input-glass"
                  type="date"
                  value={filters.to}
                  onChange={(event) => setFilters((previous) => ({ ...previous, to: event.target.value }))}
                />
              </label>
            </>
          ) : (
            <div className="flex items-end rounded-lg border border-white/10 bg-black/40 px-3 py-2">
              <CalendarCheck className="mr-2" size={18} />
              {resolvedRange.from === resolvedRange.to ? resolvedRange.from : `${resolvedRange.from} até ${resolvedRange.to}`}
            </div>
          )}
        </div>
      </Card>

      <div className="mb-4 grid gap-3 xl:grid-cols-7">
        {[
          { label: 'GMV', value: formatCurrency(summary.totals.gmv), icon: CurrencyCircleDollar },
          { label: 'CTR', value: `${summary.totals.ctr.toFixed(2)}%`, icon: TrendUp },
          { label: 'Conversão', value: `${summary.totals.conversionRate.toFixed(2)}%`, icon: ArrowsClockwise },
          { label: 'Pedidos', value: String(summary.totals.orders), icon: UserCircle },
          { label: 'Cliques', value: String(summary.totals.clicks), icon: ChartLine },
          { label: 'Comissão', value: formatCurrency(summary.totals.commission), icon: CurrencyCircleDollar },
          { label: 'Ticket médio', value: formatCurrency(summary.totals.averageOrderValue), icon: CaretDown },
        ].map((metric) => {
          const Icon = metric.icon;
          return (
            <Card key={metric.label} className="p-3">
              <div className="mb-2 flex items-center justify-between text-xs text-zinc-400">
                <span>{metric.label}</span>
                <Icon size={16} />
              </div>
              <div className="text-lg font-black">{metric.value}</div>
            </Card>
          );
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <h2 className="mb-3 text-sm font-bold">Desempenho diário (cliques)</h2>
          <div className="space-y-2">
            {summary.byDay.length ? (
              summary.byDay.map((item) => (
                <div key={item.date} className="text-xs">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-zinc-300">{item.date}</span>
                    <span className="text-zinc-400">{item.clicks} cliques</span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-white/[0.07]">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-primary to-cyan-400 transition-all"
                      style={{ width: `${Math.max(4, (item.clicks / dayMax) * 100)}%` }}
                    />
                  </div>
                  <div className="mt-1 flex justify-between text-[11px] text-zinc-500">
                    <span>Pedidos: {item.orders}</span>
                    <span>{formatCurrency(item.gmv)}</span>
                  </div>
                </div>
              ))
            ) : (
              <EmptyState>Nenhum evento no período.</EmptyState>
            )}
          </div>
        </Card>

        <Card>
          <h2 className="mb-3 text-sm font-bold">Conversão por conta</h2>
          <div className="space-y-3">
            {summary.byAccount.length ? (
              summary.byAccount.map((row) => (
                <div key={row.accountId} className="rounded-lg bg-white/[0.03] p-3 text-xs">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="font-semibold">{row.accountName}</span>
                    <PlatformBadge value={row.platform} />
                  </div>
                  <div className="grid gap-2 text-zinc-400 sm:grid-cols-3">
                    <span>Cliques: {row.clicks}</span>
                    <span>Pedidos: {row.orders}</span>
                    <span>GMV: {formatCurrency(row.gmv)}</span>
                    <span>Comissão: {formatCurrency(row.commission)}</span>
                    <span>CTR: {row.ctr.toFixed(2)}%</span>
                    <span>Conversão: {row.conversionRate.toFixed(2)}%</span>
                  </div>
                </div>
              ))
            ) : (
              <EmptyState>Nenhuma conta com dados.</EmptyState>
            )}
          </div>
        </Card>

        <Card>
          <h2 className="mb-3 text-sm font-bold">Top produtos</h2>
          <div className="space-y-3">
            {summary.topProducts.length ? (
              summary.topProducts.slice(0, 10).map((row) => (
                <div key={row.productId} className="rounded-lg bg-white/[0.03] p-3 text-xs">
                  <div className="font-semibold text-zinc-200">{row.name}</div>
                  <div className="mt-1 text-zinc-500">{row.accountName}</div>
                  <div className="mt-2 grid gap-2 text-[11px] text-zinc-400 sm:grid-cols-3">
                    <span>Cliques: {row.clicks}</span>
                    <span>Pedidos: {row.orders}</span>
                    <span>GMV: {formatCurrency(row.gmv)}</span>
                    <span>Conversão: {row.conversionRate.toFixed(2)}%</span>
                  </div>
                </div>
              ))
            ) : (
              <EmptyState>Nenhum produto com dados.</EmptyState>
            )}
          </div>
        </Card>
      </div>
    </>
  );
}

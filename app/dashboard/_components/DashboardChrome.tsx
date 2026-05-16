'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ChartLineUp,
  ChartPieSlice,
  CheckCircle,
  GearSix,
  PlayCircle,
  Rows,
  Scan,
  ShoppingBagOpen,
  Storefront,
  Tag,
  UsersThree,
} from '@phosphor-icons/react';

const nav = [
  { href: '/dashboard', label: 'Overview', icon: ChartLineUp },
  { href: '/dashboard/analytics', label: 'Analytics', icon: ChartPieSlice },
  { href: '/dashboard/accounts', label: 'Contas', icon: UsersThree },
  { href: '/dashboard/niches', label: 'Nichos', icon: Tag },
  { href: '/dashboard/scanner', label: 'Scanner', icon: Scan },
  { href: '/dashboard/approvals', label: 'Aprovações', icon: CheckCircle },
  { href: '/dashboard/products', label: 'Produtos', icon: ShoppingBagOpen },
  { href: '/dashboard/videos', label: 'Vídeos', icon: PlayCircle },
  { href: '/dashboard/publications', label: 'Publicações', icon: Rows },
  { href: '/dashboard/settings', label: 'Settings', icon: GearSix },
];

export function DashboardChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="h-screen overflow-y-auto bg-app-bg text-white">
      <header className="sticky top-0 z-30 border-b border-white/10 bg-black/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3">
          <Link href="/dashboard" className="flex items-center gap-2 text-sm font-black uppercase tracking-normal">
            <Storefront size={22} weight="fill" className="text-primary" />
            AfiliadoOS
          </Link>
          <nav className="flex flex-1 gap-1 overflow-x-auto">
            {nav.map((item) => {
              const active = pathname === item.href;
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-xs transition ${
                    active ? 'bg-primary text-white' : 'text-zinc-400 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  <Icon size={16} weight={active ? 'fill' : 'regular'} />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
    </div>
  );
}

export function PageHeader({ title, description, action }: { title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div>
        <h1 className="text-2xl font-black tracking-normal text-white">{title}</h1>
        {description ? <p className="mt-1 max-w-3xl text-sm text-zinc-400">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <section className={`rounded-lg border border-white/10 bg-zinc-950 p-4 ${className}`}>{children}</section>;
}

export function StatusBadge({ value }: { value: string }) {
  const color =
    value === 'active' || value === 'done' || value === 'published'
      ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
      : value === 'pending_auth' || value === 'pending' || value === 'scheduled' || value === 'generating' || value === 'queued'
        ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
        : 'bg-rose-500/15 text-rose-300 border-rose-500/30';
  return <span className={`inline-flex rounded-full border px-2 py-1 text-[11px] font-semibold ${color}`}>{value}</span>;
}

export function PlatformBadge({ value }: { value: string }) {
  const color =
    value === 'mercadolivre'
      ? 'bg-yellow-400 text-black'
      : value === 'shopee'
        ? 'bg-orange-500 text-white'
        : value === 'tiktokshop'
          ? 'bg-zinc-100 text-black'
          : 'bg-zinc-800 text-zinc-200';
  return <span className={`inline-flex rounded-full px-2 py-1 text-[11px] font-bold ${color}`}>{value}</span>;
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return <div className="rounded-lg border border-dashed border-white/10 p-8 text-center text-sm text-zinc-500">{children}</div>;
}

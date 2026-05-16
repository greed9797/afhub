create table if not exists public.affiliate_events (
  id uuid primary key default gen_random_uuid(),
  account_id uuid references public.affiliate_accounts(id) on delete set null,
  affiliated_product_id uuid references public.affiliated_products(id) on delete set null,
  publication_id uuid references public.publications(id) on delete set null,
  platform text not null check (platform in ('mercadolivre', 'shopee', 'tiktokshop')),
  event_type text not null check (event_type in ('impression', 'click')),
  occurred_at timestamptz not null default now(),
  raw_data jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.affiliate_orders (
  id uuid primary key default gen_random_uuid(),
  platform text not null check (platform in ('mercadolivre', 'shopee', 'tiktokshop')),
  platform_order_id text not null,
  account_id uuid references public.affiliate_accounts(id) on delete set null,
  affiliated_product_id uuid references public.affiliated_products(id) on delete set null,
  publication_id uuid references public.publications(id) on delete set null,
  status text default 'imported',
  gross_amount numeric(14,2) not null default 0,
  commission_amount numeric(14,2) not null default 0,
  currency text not null default 'BRL',
  ordered_at timestamptz not null,
  occurred_at timestamptz not null default now(),
  raw_data jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (platform, platform_order_id)
);

create table if not exists public.affiliate_metric_imports (
  id uuid primary key default gen_random_uuid(),
  platform text not null check (platform in ('mercadolivre', 'shopee', 'tiktokshop')),
  import_source text not null default 'manual',
  status text not null check (status in ('success', 'error', 'partial')),
  started_at timestamptz not null,
  completed_at timestamptz,
  record_count int not null default 0,
  imported_count int not null default 0,
  raw_data jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_affiliate_events_account_id on public.affiliate_events(account_id);
create index if not exists idx_affiliate_events_platform on public.affiliate_events(platform);
create index if not exists idx_affiliate_events_occurred_at on public.affiliate_events(occurred_at);
create index if not exists idx_affiliate_events_affiliated_product_id on public.affiliate_events(affiliated_product_id);

create index if not exists idx_affiliate_orders_account_id on public.affiliate_orders(account_id);
create index if not exists idx_affiliate_orders_platform on public.affiliate_orders(platform);
create index if not exists idx_affiliate_orders_ordered_at on public.affiliate_orders(ordered_at);
create index if not exists idx_affiliate_orders_affiliated_product_id on public.affiliate_orders(affiliated_product_id);
create index if not exists idx_affiliate_orders_platform_order_id on public.affiliate_orders(platform, platform_order_id);

create index if not exists idx_affiliate_metric_imports_platform on public.affiliate_metric_imports(platform);
create index if not exists idx_affiliate_metric_imports_status on public.affiliate_metric_imports(status);
create index if not exists idx_affiliate_metric_imports_started_at on public.affiliate_metric_imports(started_at);

alter table public.affiliate_events enable row level security;
alter table public.affiliate_orders enable row level security;
alter table public.affiliate_metric_imports enable row level security;


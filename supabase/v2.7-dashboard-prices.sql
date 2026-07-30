-- v2.7 통합 대시보드 / 시간별 일정 / 마감기한 / 거래처 단가
-- 기존 데이터는 삭제하지 않습니다.

alter table public.schedules
  add column if not exists schedule_time time;

create table if not exists public.closing_deadlines (
  month_key text primary key,
  deadline_date date not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.vendor_price_items (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendors(id) on delete cascade,
  item_name text not null,
  unit text not null default '',
  created_at timestamptz not null default now(),
  unique(vendor_id, item_name)
);

create table if not exists public.vendor_price_history (
  id uuid primary key default gen_random_uuid(),
  price_item_id uuid not null references public.vendor_price_items(id) on delete cascade,
  year_month text not null,
  price numeric not null default 0,
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(price_item_id, year_month)
);

alter table public.closing_deadlines enable row level security;
alter table public.vendor_price_items enable row level security;
alter table public.vendor_price_history enable row level security;

drop policy if exists "closing_deadlines_all" on public.closing_deadlines;
create policy "closing_deadlines_all" on public.closing_deadlines for all using (true) with check (true);
drop policy if exists "vendor_price_items_all" on public.vendor_price_items;
create policy "vendor_price_items_all" on public.vendor_price_items for all using (true) with check (true);
drop policy if exists "vendor_price_history_all" on public.vendor_price_history;
create policy "vendor_price_history_all" on public.vendor_price_history for all using (true) with check (true);

-- v2.8: 수기 미결제 거래처 관리
-- 기존 데이터는 삭제하지 않습니다.
create table if not exists public.manual_unpaid_vendors (
  id uuid primary key default gen_random_uuid(),
  month_key text not null,
  vendor_name text not null,
  amount numeric not null default 0,
  due_date date,
  note text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists manual_unpaid_vendors_month_key_idx on public.manual_unpaid_vendors(month_key);
alter table public.manual_unpaid_vendors enable row level security;
drop policy if exists "manual_unpaid_vendors_all" on public.manual_unpaid_vendors;
create policy "manual_unpaid_vendors_all" on public.manual_unpaid_vendors for all using (true) with check (true);

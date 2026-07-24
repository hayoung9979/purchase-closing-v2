-- Supabase SQL Editor에서 실행할 수 있는 권장 기본 스키마입니다.
-- 현재 v2.2 UI는 localStorage로 즉시 동작하며, 아래 테이블은 공동사용 DB 연결 단계에서 사용합니다.
create extension if not exists pgcrypto;

create table if not exists vendors (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in ('상품 및 외주가공','부자재')),
  name text not null,
  code text default '',
  ceo text default '',
  business_type text default '',
  business_item text default '',
  registration_no text default '',
  manager text default '',
  phone text default '',
  created_at timestamptz not null default now()
);

create table if not exists monthly_vendors (
  id uuid primary key default gen_random_uuid(),
  month_key text not null,
  vendor_id uuid not null references vendors(id) on delete cascade,
  updated_at timestamptz not null default now(),
  unique(month_key, vendor_id)
);

create table if not exists checklist_items (
  id uuid primary key default gen_random_uuid(),
  monthly_vendor_id uuid not null references monthly_vendors(id) on delete cascade,
  item_name text not null,
  checked boolean not null default false,
  missing_date date,
  sort_order integer not null default 0
);

create table if not exists ledger_rows (
  id uuid primary key default gen_random_uuid(),
  month_key text not null,
  category text not null check (category in ('상품 및 외주가공','부자재')),
  vendor_id uuid references vendors(id) on delete set null,
  supply numeric(14,0) not null default 0,
  tax numeric(14,0) not null default 0,
  payment text not null default '미결제' check (payment in ('미결제','결제')),
  note text default '',
  created_at timestamptz not null default now()
);

create table if not exists schedules (
  id uuid primary key default gen_random_uuid(),
  schedule_date date not null,
  content text not null,
  created_at timestamptz not null default now()
);

create table if not exists locked_months (
  month_key text primary key,
  locked_at timestamptz not null default now()
);

grant select, insert, update, delete
on table public.schedules, public.locked_months
to anon, authenticated;

alter table public.schedules enable row level security;
alter table public.locked_months enable row level security;

drop policy if exists "schedules_all" on public.schedules;
create policy "schedules_all" on public.schedules for all to anon, authenticated using (true) with check (true);

drop policy if exists "locked_months_all" on public.locked_months;
create policy "locked_months_all" on public.locked_months for all to anon, authenticated using (true) with check (true);

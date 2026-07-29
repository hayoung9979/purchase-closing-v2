-- v2.6: 체크리스트 항목별 누락일을 여러 개 저장합니다.
-- 기존 missing_date 데이터는 그대로 유지하면서 missing_dates 배열로 복사합니다.

alter table public.checklist_items
  add column if not exists missing_dates text[] not null default '{}';

update public.checklist_items
set missing_dates = array[missing_date::text]
where missing_date is not null
  and cardinality(missing_dates) = 0;

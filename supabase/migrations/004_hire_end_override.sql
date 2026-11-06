-- Hire finish can be set by hand (extensions, odd periods). Otherwise install + hire weeks.
alter table public.jobs add column if not exists hire_end_date date;
alter table public.jobs drop column hold_period;
alter table public.jobs add column hold_period daterange generated always as (
  case when coalesce(pack_date, install_date) is null then null
  else daterange(
    coalesce(pack_date, install_date),
    greatest(coalesce(pack_date, install_date),
             coalesce(unpack_date, collection_date, hire_end_date, install_date + hire_weeks * 7,
                      pack_date + hire_weeks * 7)),
    '[]')
  end) stored;
create or replace function public.hire_end(j public.jobs) returns date language sql stable set search_path = public as $$
  select coalesce(j.hire_end_date, j.install_date + j.hire_weeks * 7)
$$;

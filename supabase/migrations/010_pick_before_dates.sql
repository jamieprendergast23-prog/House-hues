-- Inventory comes first: she can pick pieces for a house before it has dates.
-- job_items.period stays null until the job gets dates; jobs_after_update then
-- copies hold_period in and the no_double_booking constraint checks for clashes.
alter table public.job_items alter column period drop not null;

create or replace function public.job_items_set_period() returns trigger
language plpgsql set search_path = public as $$
begin
  select hold_period into new.period from jobs where id = new.job_id;
  return new;
end $$;

-- Pack-up check: scan pieces onto the truck at the house; finishing flags anything not loaded as missing.
-- (applied to the live project as migration "pack_up_check"; see the Supabase migration history for the full SQL)
alter table public.job_items add column if not exists loaded_at timestamptz,
  add column if not exists loaded_by uuid references public.profiles,
  add column if not exists missing_at timestamptz;

-- Results tracker: listing + sale data per house, and "after" (styled) photos.
alter table public.jobs
  add column if not exists listed_date date,
  add column if not exists sold_date date,
  add column if not exists guide_price numeric(12,0),
  add column if not exists sale_price numeric(12,0),
  add column if not exists agent_name text;
alter table public.job_photos drop constraint if exists job_photos_kind_check;
alter table public.job_photos add constraint job_photos_kind_check check (kind in ('site', 'design', 'after'));

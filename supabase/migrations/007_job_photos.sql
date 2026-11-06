-- Site-visit photos and design renders per room on a job (crew see the renders on the pick list).
create table public.job_photos (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs on delete cascade,
  room text not null default 'Living',
  kind text not null default 'design' check (kind in ('site', 'design')),
  url text not null,
  caption text,
  created_by uuid references public.profiles default auth.uid(),
  created_at timestamptz not null default now()
);
create index job_photos_job_idx on public.job_photos (job_id, room);
alter table public.job_photos enable row level security;
create policy "staff read job_photos" on public.job_photos for select using (is_staff());
create policy "admin write job_photos" on public.job_photos for all using (is_admin()) with check (is_admin());

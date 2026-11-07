-- Reminders on a booking, shown in the calendar on their day.
-- Registered users only (is_staff); anon has no access.
create table public.reminders (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  due_date date not null,
  title text not null check (length(trim(title)) > 0),
  note text,
  done_at timestamptz,
  done_by uuid references public.profiles(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index reminders_due_idx on public.reminders (due_date) where done_at is null;
create index reminders_job_idx on public.reminders (job_id);

alter table public.reminders enable row level security;
create policy "staff read reminders"   on public.reminders for select using (is_staff());
create policy "staff add reminders"    on public.reminders for insert with check (is_staff());
create policy "staff update reminders" on public.reminders for update using (is_staff()) with check (is_staff());
create policy "admin delete reminders" on public.reminders for delete using (is_admin());
revoke all on public.reminders from anon;

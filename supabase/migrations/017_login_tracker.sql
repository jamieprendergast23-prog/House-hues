-- Login tracker, visible to Jamie only (not other admins).
create table public.login_events (
  id bigserial primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  at timestamptz not null default now(),
  kind text not null check (kind in ('sign_in', 'open')),
  device text
);
create index login_events_at_idx on public.login_events (at desc);
create index login_events_user_idx on public.login_events (user_id, at desc);
alter table public.login_events enable row level security;
revoke all on public.login_events from anon, authenticated;

-- who may view the tracker (fixed here, so no one can grant it from inside the app)
create function public.can_view_logins() returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() = '56d8965f-3d96-41fd-92eb-d01064561c8a'::uuid;
$$;

-- the app calls this on sign-in and when it's opened (opens at most every 30 min per person)
create function public.log_activity(p_kind text, p_device text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or p_kind not in ('sign_in', 'open') then return; end if;
  if p_kind = 'open' and exists (select 1 from login_events
      where user_id = auth.uid() and at > now() - interval '30 minutes') then return; end if;
  insert into login_events (user_id, kind, device) values (auth.uid(), p_kind, left(p_device, 80));
end $$;

create function public.login_tracker(p_limit int default 300)
returns table (user_id uuid, full_name text, role text, at timestamptz, kind text, device text)
language sql stable security definer set search_path = public as $$
  select e.user_id, p.full_name, p.role::text, e.at, e.kind, e.device
  from login_events e join profiles p on p.id = e.user_id
  where can_view_logins()
  order by e.at desc
  limit least(greatest(p_limit, 1), 2000);
$$;

revoke execute on function public.can_view_logins(), public.log_activity(text, text), public.login_tracker(int) from public, anon;
grant execute on function public.can_view_logins(), public.log_activity(text, text), public.login_tracker(int) to authenticated;

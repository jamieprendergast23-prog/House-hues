-- Outlook (Microsoft 365) connection for the owner's inbox.
-- Tokens are readable ONLY by the server (service role): no RLS policies at all,
-- and no grants to anon/authenticated. The app sees connection status via mail_status().
create table public.mail_accounts (
  id int primary key default 1 check (id = 1),          -- one shared business inbox
  email text not null,
  refresh_token text not null,
  access_token text,
  expires_at timestamptz,
  connected_by uuid references public.profiles(id) on delete set null,
  connected_at timestamptz not null default now()
);
alter table public.mail_accounts enable row level security;
revoke all on public.mail_accounts from anon, authenticated;

-- one-time values that protect the Microsoft sign-in round trip
create table public.mail_oauth_states (
  state text primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.mail_oauth_states enable row level security;
revoke all on public.mail_oauth_states from anon, authenticated;

-- admins can see whether email is connected, and which address (never the tokens)
create function public.mail_status() returns table (email text, connected_at timestamptz)
language sql stable security definer set search_path = public as $$
  select email, connected_at from mail_accounts where is_admin();
$$;
revoke execute on function public.mail_status() from public, anon;
grant execute on function public.mail_status() to authenticated;

-- House & Hues: inventory, jobs, bookings
-- Run once in Supabase: SQL Editor > New query > paste > Run.

create extension if not exists btree_gist with schema extensions;

-- ============================================================
-- USERS & ROLES
-- ============================================================
create type app_role as enum ('admin', 'crew');

create table profiles (
  id uuid primary key references auth.users on delete cascade,
  full_name text,
  role app_role not null default 'crew',
  created_at timestamptz not null default now()
);

-- every new auth user gets a profile (crew by default)
create function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)));
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

create function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin')
$$;

create function is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid())
$$;

-- ============================================================
-- INVENTORY
-- One row per physical piece (so every piece has its own QR).
-- ============================================================
create type item_status as enum ('available', 'repair', 'retired');
create sequence item_code_seq start 1;

create table items (
  id uuid primary key default gen_random_uuid(),
  code text not null unique
    default ('HH-' || lpad(nextval('item_code_seq')::text, 4, '0')),
  name text not null,
  category text not null default 'Other',
  colour text,
  dimensions text,
  description text,
  shed_location text,               -- e.g. "Bay 3, top shelf"
  condition text not null default 'good'
    check (condition in ('good', 'fair', 'needs_repair')),
  status item_status not null default 'available',
  photo_url text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index items_category_idx on items (category);

-- money lives in its own admin-only table so crew never see it
create table item_costs (
  item_id uuid primary key references items on delete cascade,
  purchase_cost numeric(10,2),
  replacement_value numeric(10,2),
  purchased_on date,
  supplier text
);

-- ============================================================
-- CLIENTS (agents, homeowners)
-- ============================================================
create table clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  agency text,
  email text,
  phone text,
  kind text not null default 'agent' check (kind in ('agent', 'homeowner', 'other')),
  notes text,
  created_at timestamptz not null default now()
);

-- ============================================================
-- JOBS (staging, consult, design)
-- ============================================================
create type job_type as enum ('staging', 'consult', 'design');
create sequence job_number_seq start 1001;

create table jobs (
  id uuid primary key default gen_random_uuid(),
  job_number int not null unique default nextval('job_number_seq'),
  type job_type not null default 'staging',
  status text not null default 'enquiry' check (status in (
    'enquiry', 'site_visit', 'quote_sent', 'accepted', 'booked',
    'packing', 'installed', 'collected', 'complete',
    'paid', 'consult_booked', 'follow_up_sent', 'in_progress',
    'cancelled')),
  client_id uuid references clients on delete set null,
  property_address text not null,
  suburb text,
  access_notes text,                -- lockbox, parking, stairs (crew can see)
  site_visit_date date,
  consult_date date,
  pack_date date,
  install_date date,
  hire_weeks int not null default 6 check (hire_weeks between 1 and 52),
  collection_date date,
  unpack_date date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- the date range furniture for this job is unavailable to anything else:
  -- packing day -> unpack day (falls back to install / collection / end of hire)
  hold_period daterange generated always as (
    case when coalesce(pack_date, install_date) is null then null
    else daterange(
      coalesce(pack_date, install_date),
      greatest(coalesce(pack_date, install_date),
               coalesce(unpack_date, collection_date, install_date + hire_weeks * 7,
                        pack_date + hire_weeks * 7)),
      '[]')
    end) stored
);

-- convenience: hire end date
create function hire_end(j jobs) returns date language sql stable set search_path = public as $$
  select j.install_date + j.hire_weeks * 7
$$;

create table job_finance (
  job_id uuid primary key references jobs on delete cascade,
  quote_amount numeric(10,2),
  deposit_amount numeric(10,2),
  deposit_paid_on date,
  paid_in_full_on date,
  invoice_ref text,
  notes text
);

-- ============================================================
-- ITEM <-> JOB ASSIGNMENTS (the pick list)
-- ============================================================
create table job_items (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references jobs on delete cascade,
  item_id uuid not null references items on delete restrict,
  room text not null default 'Living',
  period daterange not null,        -- copied from jobs.hold_period by trigger
  packed_at timestamptz,
  packed_by uuid references profiles,
  installed_at timestamptz,
  returned_at timestamptz,
  returned_by uuid references profiles,
  notes text,
  created_at timestamptz not null default now(),
  unique (job_id, item_id),
  -- THE double-booking guard: the database itself refuses to put one item
  -- on two jobs whose dates overlap (until it has been returned to the shed)
  constraint no_double_booking exclude using gist (
    item_id with =, period with &&
  ) where (returned_at is null)
);
create index job_items_job_idx on job_items (job_id);

create function job_items_set_period() returns trigger
language plpgsql set search_path = public as $$
declare p daterange;
begin
  select hold_period into p from jobs where id = new.job_id;
  if p is null then
    raise exception 'Set the packing or install date on this job before adding items'
      using errcode = 'P0001';
  end if;
  new.period := p;
  return new;
end $$;

create trigger job_items_period before insert on job_items
  for each row execute function job_items_set_period();

-- when job dates move, move the holds too (fails cleanly if that would double-book)
create function jobs_sync_period() returns trigger
language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end $$;
create trigger jobs_touch before update on jobs
  for each row execute function jobs_sync_period();

create function jobs_after_update() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.hold_period is distinct from old.hold_period and new.hold_period is not null then
    update job_items set period = new.hold_period
      where job_id = new.id and returned_at is null;
  end if;
  if new.status = 'cancelled' and old.status <> 'cancelled' then
    delete from job_items where job_id = new.id and packed_at is null;
  end if;
  return new;
end $$;
create trigger jobs_after_update after update on jobs
  for each row execute function jobs_after_update();

create function items_touch() returns trigger language plpgsql set search_path = public as $$
begin new.updated_at := now(); return new; end $$;
create trigger items_touch before update on items
  for each row execute function items_touch();

-- ============================================================
-- BOOKING REQUESTS (public form, inserted by Netlify function)
-- ============================================================
create table booking_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null,
  email text not null,
  phone text,
  agency text,
  property_address text not null,
  suburb text,
  service_type text not null check (service_type in ('staging', 'consult', 'design')),
  preferred_date date,
  property_type text,
  bedrooms int,
  occupied boolean,
  message text,
  status text not null default 'new' check (status in ('new', 'converted', 'declined')),
  job_id uuid references jobs on delete set null
);

-- ============================================================
-- VIEWS
-- ============================================================
-- every item + where it is right now + its next booking
create view v_items with (security_invoker = true) as
select i.*,
  out_.job_id        as out_job_id,
  out_.address       as out_address,
  out_.packed_at     as out_since,
  nxt.job_id         as next_job_id,
  nxt.address        as next_address,
  lower(nxt.period)  as next_start
from items i
left join lateral (
  select ji.job_id, j.property_address as address, ji.packed_at
  from job_items ji join jobs j on j.id = ji.job_id
  where ji.item_id = i.id and ji.packed_at is not null and ji.returned_at is null
  order by ji.packed_at desc limit 1
) out_ on true
left join lateral (
  select ji.job_id, j.property_address as address, ji.period
  from job_items ji join jobs j on j.id = ji.job_id
  where ji.item_id = i.id and ji.packed_at is null and ji.returned_at is null
    and upper(ji.period) >= current_date
  order by lower(ji.period) limit 1
) nxt on true;

-- ============================================================
-- AVAILABILITY
-- ============================================================
-- items free for the whole of a job's hold period
create function available_items(p_job_id uuid)
returns setof v_items language sql stable security invoker set search_path = public as $$
  select v.* from v_items v
  where v.status = 'available'
    and not exists (select 1 from job_items x where x.job_id = p_job_id and x.item_id = v.id)
    and not exists (
      select 1 from job_items x
      where x.item_id = v.id and x.returned_at is null
        and x.period && (select hold_period from jobs where id = p_job_id))
  order by v.category, v.name
$$;

-- what would clash if this job's dates changed to p_range
create function job_date_conflicts(p_job_id uuid, p_range daterange)
returns table (item_code text, item_name text, other_job int, other_address text)
language sql stable security invoker set search_path = public as $$
  select i.code, i.name, j.job_number, j.property_address
  from job_items mine
  join items i on i.id = mine.item_id
  join job_items other on other.item_id = mine.item_id
    and other.job_id <> p_job_id and other.returned_at is null
    and other.period && p_range
  join jobs j on j.id = other.job_id
  where mine.job_id = p_job_id and mine.returned_at is null
$$;

-- ============================================================
-- CREW ACTIONS (crew can't edit tables directly, only via these)
-- ============================================================
create function scan_pack(p_job_id uuid, p_code text)
returns json language plpgsql security definer set search_path = public as $$
declare it items; ji job_items;
begin
  if not is_staff() then raise exception 'Not signed in'; end if;
  select * into it from items where code = upper(trim(p_code));
  if not found then return json_build_object('result', 'unknown_code'); end if;
  select * into ji from job_items where job_id = p_job_id and item_id = it.id;
  if not found then
    return json_build_object('result', 'not_on_list', 'name', it.name, 'code', it.code);
  end if;
  if ji.packed_at is not null then
    return json_build_object('result', 'already', 'name', it.name, 'code', it.code, 'room', ji.room);
  end if;
  update job_items set packed_at = now(), packed_by = auth.uid() where id = ji.id;
  return json_build_object('result', 'packed', 'name', it.name, 'code', it.code, 'room', ji.room);
end $$;

create function scan_return(p_code text, p_shed_location text default null)
returns json language plpgsql security definer set search_path = public as $$
declare it items; ji job_items; addr text;
begin
  if not is_staff() then raise exception 'Not signed in'; end if;
  select * into it from items where code = upper(trim(p_code));
  if not found then return json_build_object('result', 'unknown_code'); end if;
  select * into ji from job_items
    where item_id = it.id and packed_at is not null and returned_at is null
    order by packed_at desc limit 1;
  if not found then
    return json_build_object('result', 'not_out', 'name', it.name, 'code', it.code);
  end if;
  update job_items set returned_at = now(), returned_by = auth.uid() where id = ji.id;
  if nullif(trim(p_shed_location), '') is not null then
    update items set shed_location = trim(p_shed_location) where id = it.id;
  end if;
  select property_address into addr from jobs where id = ji.job_id;
  return json_build_object('result', 'returned', 'name', it.name, 'code', it.code, 'from', addr);
end $$;

-- tick / untick a pick-list line: state = packed | unpacked | installed | returned | unreturned
create function set_job_item_state(p_job_item_id uuid, p_state text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_staff() then raise exception 'Not signed in'; end if;
  update job_items set
    packed_at    = case p_state when 'packed' then coalesce(packed_at, now())
                                when 'unpacked' then null else packed_at end,
    packed_by    = case p_state when 'packed' then auth.uid()
                                when 'unpacked' then null else packed_by end,
    installed_at = case p_state when 'installed' then now() else installed_at end,
    returned_at  = case p_state when 'returned' then now()
                                when 'unreturned' then null else returned_at end,
    returned_by  = case p_state when 'returned' then auth.uid()
                                when 'unreturned' then null else returned_by end
  where id = p_job_item_id;
end $$;

create function flag_item(p_item_id uuid, p_condition text, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_staff() then raise exception 'Not signed in'; end if;
  update items set
    condition = p_condition,
    status = case when p_condition = 'needs_repair' then 'repair'::item_status else status end,
    notes = case when nullif(trim(p_note), '') is null then notes
                 else concat_ws(E'\n', notes, to_char(now(), 'DD Mon') || ': ' || trim(p_note)) end
  where id = p_item_id;
end $$;

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
alter table profiles enable row level security;
alter table items enable row level security;
alter table item_costs enable row level security;
alter table clients enable row level security;
alter table jobs enable row level security;
alter table job_finance enable row level security;
alter table job_items enable row level security;
alter table booking_requests enable row level security;

create policy "own profile or admin" on profiles for select using (id = auth.uid() or is_admin());
create policy "admin manages profiles" on profiles for update using (is_admin());

-- staff read; admin writes
create policy "staff read items" on items for select using (is_staff());
create policy "admin write items" on items for all using (is_admin()) with check (is_admin());
create policy "staff read jobs" on jobs for select using (is_staff());
create policy "admin write jobs" on jobs for all using (is_admin()) with check (is_admin());
create policy "staff read job_items" on job_items for select using (is_staff());
create policy "admin write job_items" on job_items for all using (is_admin()) with check (is_admin());

-- admin only
create policy "admin item_costs" on item_costs for all using (is_admin()) with check (is_admin());
create policy "admin clients" on clients for all using (is_admin()) with check (is_admin());
create policy "admin job_finance" on job_finance for all using (is_admin()) with check (is_admin());
create policy "admin booking_requests" on booking_requests for all using (is_admin()) with check (is_admin());

-- ============================================================
-- PHOTO STORAGE
-- ============================================================
insert into storage.buckets (id, name, public) values ('item-photos', 'item-photos', true)
  on conflict (id) do nothing;

-- bucket is public, so photo URLs work without a select policy (and nobody can list the bucket)
create policy "admin upload item photos" on storage.objects for insert
  with check (bucket_id = 'item-photos' and is_admin());
create policy "admin update item photos" on storage.objects for update
  using (bucket_id = 'item-photos' and is_admin());
create policy "admin delete item photos" on storage.objects for delete
  using (bucket_id = 'item-photos' and is_admin());

-- Damage & repair history per item, crew can report (with photo), admin marks repaired.
create table public.item_events (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items on delete cascade,
  kind text not null check (kind in ('damage', 'repaired', 'note')),
  severity text check (severity in ('fair', 'needs_repair')),
  note text,
  photo_url text,
  created_by uuid references public.profiles default auth.uid(),
  created_at timestamptz not null default now()
);
create index item_events_item_idx on public.item_events (item_id, created_at desc);
alter table public.item_events enable row level security;
create policy "staff read item_events" on public.item_events for select using (is_staff());
create policy "admin write item_events" on public.item_events for all using (is_admin()) with check (is_admin());

drop function if exists public.flag_item(uuid, text, text);
create function public.flag_item(p_item_id uuid, p_condition text, p_note text default null, p_photo text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_staff() then raise exception 'Not signed in'; end if;
  if p_condition not in ('fair', 'needs_repair') then raise exception 'Bad condition'; end if;
  update items set
    condition = p_condition,
    status = case when p_condition = 'needs_repair' then 'repair'::item_status else status end
  where id = p_item_id;
  insert into item_events (item_id, kind, severity, note, photo_url, created_by)
  values (p_item_id, 'damage', p_condition, nullif(trim(p_note), ''), p_photo, auth.uid());
end $$;
revoke execute on function public.flag_item(uuid, text, text, text) from public, anon;
grant execute on function public.flag_item(uuid, text, text, text) to authenticated;

create function public.mark_repaired(p_item_id uuid, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Only admins can mark repairs'; end if;
  update items set condition = 'good',
    status = case when status = 'repair' then 'available'::item_status else status end
  where id = p_item_id;
  insert into item_events (item_id, kind, note, created_by)
  values (p_item_id, 'repaired', nullif(trim(p_note), ''), auth.uid());
end $$;
revoke execute on function public.mark_repaired(uuid, text) from public, anon;
grant execute on function public.mark_repaired(uuid, text) to authenticated;

create policy "staff upload damage photos" on storage.objects for insert
  with check (bucket_id = 'item-photos' and (storage.foldername(name))[1] = 'damage' and is_staff());

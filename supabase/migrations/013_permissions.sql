-- Per-person access. Admins can do everything. Everyone else gets the areas
-- the owner ticks for them on the Team page:
--   dashboard, stock, houses, calendar, money, emails, field
-- Existing crew keep what they had: field mode only.
alter table public.profiles add column permissions text[] not null default '{field}';

create function public.has_perm(p text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and (role = 'admin' or p = any(permissions)));
$$;
revoke execute on function public.has_perm(text) from public, anon;
grant execute on function public.has_perm(text) to authenticated;

-- stock
drop policy "admin write items" on public.items;
create policy "stock write items" on public.items for all using (has_perm('stock')) with check (has_perm('stock'));
drop policy "admin write item_events" on public.item_events;
create policy "stock write item_events" on public.item_events for all using (has_perm('stock')) with check (has_perm('stock'));

-- money (what stock cost, prices and payments)
drop policy "admin item_costs" on public.item_costs;
create policy "money item_costs" on public.item_costs for all using (has_perm('money')) with check (has_perm('money'));
drop policy "admin job_finance" on public.job_finance;
create policy "money job_finance" on public.job_finance for all using (has_perm('money')) with check (has_perm('money'));

-- houses (bookings, clients, picking furniture, rooms, photos)
drop policy "admin write jobs" on public.jobs;
create policy "houses write jobs" on public.jobs for all using (has_perm('houses')) with check (has_perm('houses'));
drop policy "admin write job_items" on public.job_items;
create policy "houses write job_items" on public.job_items for all using (has_perm('houses')) with check (has_perm('houses'));
drop policy "admin write job_photos" on public.job_photos;
create policy "houses write job_photos" on public.job_photos for all using (has_perm('houses')) with check (has_perm('houses'));
drop policy "admin clients" on public.clients;
create policy "houses clients" on public.clients for all using (has_perm('houses')) with check (has_perm('houses'));
drop policy "admin delete reminders" on public.reminders;
create policy "houses delete reminders" on public.reminders for delete using (has_perm('houses') or has_perm('calendar'));

-- photos: stock or houses people can upload / replace / remove
drop policy "admin upload item photos" on storage.objects;
drop policy "admin update item photos" on storage.objects;
drop policy "admin delete item photos" on storage.objects;
create policy "staff upload item photos" on storage.objects for insert
  with check (bucket_id = 'item-photos' and (has_perm('stock') or has_perm('houses')));
create policy "staff update item photos" on storage.objects for update
  using (bucket_id = 'item-photos' and (has_perm('stock') or has_perm('houses')));
create policy "staff delete item photos" on storage.objects for delete
  using (bucket_id = 'item-photos' and (has_perm('stock') or has_perm('houses')));

-- (marking repairs stays open to every signed-in person, as before)

-- email status follows Emails access
create or replace function public.mail_status() returns table (email text, connected_at timestamptz)
language sql stable security definer set search_path = public as $$
  select email, connected_at from mail_accounts where has_perm('emails');
$$;

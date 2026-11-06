-- The owner's own item code (e.g. "A1", "F99") from her spreadsheet.
-- Separate from the system code (HH-0001) because one of her codes can cover several identical pieces.
drop function if exists public.available_items(uuid);
drop view if exists public.v_items;
alter table public.items add column if not exists sku text;
create index if not exists items_sku_idx on public.items (sku);
-- (view v_items and function available_items are recreated exactly as in 001_init.sql)
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

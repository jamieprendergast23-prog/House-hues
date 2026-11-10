-- Retired pieces can be listed on a public "For sale" page.
alter table public.items
  add column for_sale boolean not null default false,
  add column sale_price numeric(10,2),
  add column sale_note text,
  add column sold_at timestamptz;

-- Show the sale fields in the stock list too (appended so the view stays compatible)
create or replace view public.v_items with (security_invoker = true) as
 SELECT i.id, i.code, i.name, i.category, i.colour, i.dimensions, i.description, i.shed_location,
    i.condition, i.status, i.photo_url, i.notes, i.created_at, i.updated_at, i.sku, i.subcategory,
    out_.job_id AS out_job_id, out_.address AS out_address, out_.packed_at AS out_since, out_.until AS out_until,
    nxt.job_id AS next_job_id, nxt.address AS next_address, lower(nxt.period) AS next_start,
    i.for_sale, i.sale_price, i.sold_at
   FROM items i
     LEFT JOIN LATERAL ( SELECT ji.job_id, j.property_address AS address, ji.packed_at, (upper(ji.period) - 1) AS until
           FROM job_items ji JOIN jobs j ON j.id = ji.job_id
          WHERE ji.item_id = i.id AND ji.packed_at IS NOT NULL AND ji.returned_at IS NULL
          ORDER BY ji.packed_at DESC LIMIT 1) out_ ON true
     LEFT JOIN LATERAL ( SELECT ji.job_id, j.property_address AS address, ji.period
           FROM job_items ji JOIN jobs j ON j.id = ji.job_id
          WHERE ji.item_id = i.id AND ji.packed_at IS NULL AND ji.returned_at IS NULL AND upper(ji.period) >= CURRENT_DATE
          ORDER BY lower(ji.period) LIMIT 1) nxt ON true;

-- The only thing the public can read: listed, unsold pieces, safe columns only
-- (no codes, costs, shed spots, notes or house history).
create function public.sale_items()
returns table (id uuid, name text, category text, colour text, dimensions text, description text,
               photo_url text, sale_price numeric, sale_note text, listed_at timestamptz)
language sql stable security definer set search_path = public as $$
  select i.id, i.name, i.category, i.colour, i.dimensions, i.description, i.photo_url, i.sale_price, i.sale_note, i.updated_at
  from items i
  where i.for_sale and i.sold_at is null and i.status = 'retired'
  order by i.updated_at desc
$$;
revoke execute on function public.sale_items() from public;
grant execute on function public.sale_items() to anon, authenticated;

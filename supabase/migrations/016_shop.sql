-- Online shop: pieces are held during checkout so two people can't buy the same one,
-- and each paid order is recorded for the owner to arrange pickup.
alter table public.items
  add column reserved_until timestamptz,
  add column reserved_session text;

create table public.shop_orders (
  id uuid primary key default gen_random_uuid(),
  stripe_session text unique not null,
  item_ids uuid[] not null,
  items jsonb not null default '[]',          -- [{id, name, price}] as sold
  total numeric(10,2) not null,
  buyer_name text,
  buyer_email text,
  buyer_phone text,
  note text,
  status text not null default 'paid' check (status in ('paid', 'collected', 'refunded')),
  collected_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.shop_orders enable row level security;
revoke all on public.shop_orders from anon;
create policy "money read shop orders" on public.shop_orders for select using (has_perm('money') or has_perm('stock'));
create policy "money update shop orders" on public.shop_orders for update using (has_perm('money') or has_perm('stock')) with check (has_perm('money') or has_perm('stock'));

-- Public list: listed, unsold, not held by someone checking out. Safe columns only.
create or replace function public.sale_items()
returns table (id uuid, name text, category text, colour text, dimensions text, description text,
               photo_url text, sale_price numeric, sale_note text, listed_at timestamptz)
language sql stable security definer set search_path = public as $$
  select i.id, i.name, i.category, i.colour, i.dimensions, i.description, i.photo_url, i.sale_price, i.sale_note, i.updated_at
  from items i
  where i.for_sale and i.sold_at is null and i.status = 'retired' and i.sale_price > 0
    and (i.reserved_until is null or i.reserved_until < now())
  order by i.updated_at desc
$$;

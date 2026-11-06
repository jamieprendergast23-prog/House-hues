-- Sub-groups inside a category (e.g. Furniture > Sofas & lounges).
-- v_items / available_items recreated as in 001 so the view picks up the new column.
alter table public.items add column if not exists subcategory text;

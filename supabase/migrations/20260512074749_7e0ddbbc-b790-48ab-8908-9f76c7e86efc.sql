
-- Roles
create type public.app_role as enum ('admin');

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);

alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

create policy "users read own roles" on public.user_roles
for select to authenticated using (user_id = auth.uid());

-- Products
create table public.products (
  id uuid primary key default gen_random_uuid(),
  design_number text not null,
  price numeric(10,2) not null default 0,
  colors text[] not null default '{}',
  sizes text[] not null default '{}',
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.products enable row level security;

create policy "anyone can view products" on public.products
for select using (true);

create policy "admins can insert products" on public.products
for insert to authenticated with check (public.has_role(auth.uid(), 'admin'));

create policy "admins can update products" on public.products
for update to authenticated using (public.has_role(auth.uid(), 'admin'));

create policy "admins can delete products" on public.products
for delete to authenticated using (public.has_role(auth.uid(), 'admin'));

-- Product images
create table public.product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  url text not null,
  storage_path text,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

alter table public.product_images enable row level security;

create policy "anyone can view product images" on public.product_images
for select using (true);

create policy "admins manage product images" on public.product_images
for all to authenticated
using (public.has_role(auth.uid(), 'admin'))
with check (public.has_role(auth.uid(), 'admin'));

-- Orders
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  customer_name text not null,
  customer_phone text not null,
  items jsonb not null default '[]'::jsonb,
  subtotal numeric(10,2) not null default 0,
  discount_pct numeric(5,2) not null default 0,
  discount_amount numeric(10,2) not null default 0,
  net_total numeric(10,2) not null default 0,
  total_pieces int not null default 0,
  notes text,
  created_at timestamptz not null default now()
);

alter table public.orders enable row level security;

create policy "anyone can place an order" on public.orders
for insert with check (true);

create policy "admins can view orders" on public.orders
for select to authenticated using (public.has_role(auth.uid(), 'admin'));

create policy "admins can delete orders" on public.orders
for delete to authenticated using (public.has_role(auth.uid(), 'admin'));

-- Storage bucket
insert into storage.buckets (id, name, public) values ('product-images', 'product-images', true);

create policy "public read product images" on storage.objects
for select using (bucket_id = 'product-images');

create policy "admins upload product images" on storage.objects
for insert to authenticated
with check (bucket_id = 'product-images' and public.has_role(auth.uid(), 'admin'));

create policy "admins update product images" on storage.objects
for update to authenticated
using (bucket_id = 'product-images' and public.has_role(auth.uid(), 'admin'));

create policy "admins delete product images" on storage.objects
for delete to authenticated
using (bucket_id = 'product-images' and public.has_role(auth.uid(), 'admin'));

-- Updated at trigger
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

create trigger products_updated_at before update on public.products
for each row execute function public.set_updated_at();

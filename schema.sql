-- ============================================
-- TWIST PRO ABIDJAN - Schéma Supabase
-- ============================================

-- Catégories de produits (ex: Twists, Mèches, Accessoires)
create table categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_at timestamptz default now()
);

-- Produits
create table products (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references categories(id) on delete set null,
  name text not null,
  slug text not null unique,
  description text,
  price integer not null, -- en FCFA, pas de décimales
  stock integer not null default 0,
  images text[] default '{}', -- URLs Supabase Storage
  is_active boolean default true,
  created_at timestamptz default now()
);

-- Communes d'Abidjan (liste fixe utilisée côté front, gardée ici pour référence/validation)
create table communes (
  id serial primary key,
  name text not null unique
);

insert into communes (name) values
  ('Cocody'), ('Yopougon'), ('Plateau'), ('Marcory'), ('Treichville'),
  ('Koumassi'), ('Abobo'), ('Adjamé'), ('Attécoubé'), ('Port-Bouët'),
  ('Bingerville'), ('Songon'), ('Anyama');

-- Commandes
create table orders (
  id uuid primary key default gen_random_uuid(),
  customer_name text not null,
  phone text not null, -- format +225 XX XX XX XX XX
  commune text not null,
  address_details text, -- quartier, repère, précisions livraison
  payment_method text not null default 'cash_ou_mobile_livraison',
  status text not null default 'en_attente', -- en_attente | confirmee | expediee | livree | annulee
  total integer not null, -- en FCFA
  created_at timestamptz default now()
);

-- Lignes de commande
create table order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references orders(id) on delete cascade,
  product_id uuid references products(id) on delete set null,
  product_name text not null, -- copie au cas où le produit est supprimé plus tard
  unit_price integer not null,
  quantity integer not null default 1
);

-- ============================================
-- Row Level Security
-- ============================================

alter table categories enable row level security;
alter table products enable row level security;
alter table orders enable row level security;
alter table order_items enable row level security;

-- Lecture publique des catégories et produits actifs
create policy "public_read_categories" on categories
  for select using (true);

create policy "public_read_products" on products
  for select using (is_active = true);

-- Création de commande publique (n'importe quel visiteur peut passer commande)
create policy "public_insert_orders" on orders
  for insert with check (true);

create policy "public_insert_order_items" on order_items
  for insert with check (true);

-- Pas de lecture publique des commandes (réservé à l'admin authentifié)
create policy "admin_read_orders" on orders
  for select using (auth.role() = 'authenticated');

create policy "admin_read_order_items" on order_items
  for select using (auth.role() = 'authenticated');

-- Admin peut tout gérer sur produits/catégories (via dashboard authentifié)
create policy "admin_manage_products" on products
  for all using (auth.role() = 'authenticated');

create policy "admin_manage_categories" on categories
  for all using (auth.role() = 'authenticated');

create policy "admin_manage_orders" on orders
  for update using (auth.role() = 'authenticated');

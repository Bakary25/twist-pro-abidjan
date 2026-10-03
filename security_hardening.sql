-- ============================================
-- TWIST PRO ABIDJAN — Durcissement sécurité Supabase
-- ============================================
-- À exécuter dans Supabase Dashboard > SQL Editor.
-- Script idempotent : rejouable sans erreur (DROP ... IF EXISTS avant chaque CREATE).
--
-- Contenu :
--   1. RLS : policies strictes sur categories / products / orders / order_items
--   2. Extension "http" (appel sortant depuis Postgres, pour vérifier Turnstile)
--   3. Secret Turnstile via Supabase Vault (étape manuelle, voir encadré plus bas)
--   4. Fonction create_order() : SECURITY DEFINER, recalcule le total, valide le
--      stock et les quantités, vérifie le jeton Turnstile avant tout insert.
--
-- ⚠️ ÉTAPE MANUELLE AVANT D'EXÉCUTER CE SCRIPT :
-- Crée un site Turnstile sur https://dash.cloudflare.com/ > Turnstile, récupère sa
-- "Secret Key", puis exécute UNE FOIS (en remplaçant la valeur) :
--
--   select vault.create_secret('COLLE_TA_CLE_SECRETE_TURNSTILE_ICI', 'turnstile_secret_key',
--     'Clé secrète Turnstile utilisée par create_order()');
--
-- Si le secret existe déjà et que tu dois le changer :
--
--   select vault.update_secret(
--     (select id from vault.secrets where name = 'turnstile_secret_key'),
--     'NOUVELLE_CLE_SECRETE'
--   );
--
-- Ne commite JAMAIS la vraie clé secrète dans ce fichier ou ailleurs dans le repo.
-- ============================================


-- ============================================
-- 1. ROW LEVEL SECURITY
-- ============================================

alter table categories enable row level security;
alter table products enable row level security;
alter table orders enable row level security;
alter table order_items enable row level security;

-- --- categories : lecture publique, écriture admin uniquement ---
drop policy if exists "public_read_categories" on categories;
create policy "public_read_categories" on categories
  for select using (true);

drop policy if exists "admin_manage_categories" on categories;
create policy "admin_manage_categories" on categories
  for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- --- products : lecture publique des produits actifs, écriture admin uniquement ---
drop policy if exists "public_read_products" on products;
create policy "public_read_products" on products
  for select using (is_active = true);

drop policy if exists "admin_manage_products" on products;
create policy "admin_manage_products" on products
  for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- --- orders : AUCUN accès direct pour anon (ni lecture, ni écriture). ---
-- La création passe exclusivement par la fonction create_order() (SECURITY DEFINER,
-- plus bas), qui contourne RLS pour son propre insert après avoir validé la commande.
-- On retire donc l'ancienne policy d'insert publique : un visiteur ne doit jamais
-- pouvoir écrire directement dans orders/order_items (total/prix forgés, spam...).
drop policy if exists "public_insert_orders" on orders;
drop policy if exists "public_insert_order_items" on order_items;

drop policy if exists "admin_read_orders" on orders;
create policy "admin_read_orders" on orders
  for select using (auth.role() = 'authenticated');

drop policy if exists "admin_read_order_items" on order_items;
create policy "admin_read_order_items" on order_items
  for select using (auth.role() = 'authenticated');

drop policy if exists "admin_manage_orders" on orders;
create policy "admin_manage_orders" on orders
  for update
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');


-- ============================================
-- 2. Extension "http" (appel synchrone sortant depuis une fonction Postgres)
-- ============================================
-- Nécessaire pour vérifier le jeton Turnstile auprès de Cloudflare avant de créer
-- la commande. Si la création échoue ("permission denied" ou extension introuvable),
-- active-la depuis Dashboard > Database > Extensions (cherche "http") puis relance.
create extension if not exists http with schema extensions;


-- ============================================
-- 3. Fonction create_order()
-- ============================================
-- Supprime les anciennes signatures possibles avant de recréer (évite les conflits
-- de surcharge si la fonction existait déjà avec une signature différente).
drop function if exists public.create_order(text, text, text, text, jsonb);
drop function if exists public.create_order(text, text, text, text, jsonb, text);

create or replace function public.create_order(
  p_customer_name text,
  p_phone text,
  p_commune text,
  p_address_details text,
  p_items jsonb,            -- ex: [{"product_id": "...", "quantity": 2}, ...]
  p_turnstile_token text     -- jeton du widget Cloudflare Turnstile côté front
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_order_id uuid := gen_random_uuid();
  v_item jsonb;
  v_product products%rowtype;
  v_quantity integer;
  v_total integer := 0;
  v_item_count integer;
  v_turnstile_secret text;
  v_verify_response jsonb;
begin
  -- -------- 0. Validation des champs client --------
  if p_customer_name is null or length(trim(p_customer_name)) = 0 then
    raise exception 'Nom du client requis';
  end if;

  if p_phone is null or length(trim(p_phone)) = 0 then
    raise exception 'Numéro de téléphone requis';
  end if;

  if p_commune is null or not exists (select 1 from communes where name = p_commune) then
    raise exception 'Commune invalide';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Le panier est vide';
  end if;

  v_item_count := jsonb_array_length(p_items);
  if v_item_count > 50 then
    raise exception 'Trop d''articles différents dans la commande';
  end if;

  -- -------- 1. Anti-spam : vérification Turnstile auprès de Cloudflare --------
  if p_turnstile_token is null or length(trim(p_turnstile_token)) = 0 then
    raise exception 'Vérification anti-robot manquante';
  end if;

  select decrypted_secret into v_turnstile_secret
  from vault.decrypted_secrets
  where name = 'turnstile_secret_key';

  if v_turnstile_secret is null then
    -- Le secret n'a pas été configuré (voir l'encadré en tête de fichier) :
    -- on refuse plutôt que de laisser passer des commandes non vérifiées.
    raise exception 'Configuration anti-spam manquante côté serveur';
  end if;

  select content::jsonb into v_verify_response
  from extensions.http_post(
    'https://challenges.cloudflare.com/turnstile/v0/siteverify',
    'secret=' || extensions.urlencode(v_turnstile_secret)
      || '&response=' || extensions.urlencode(p_turnstile_token),
    'application/x-www-form-urlencoded'
  );

  if v_verify_response is null or coalesce((v_verify_response->>'success')::boolean, false) is not true then
    raise exception 'Vérification anti-robot échouée, réessaie';
  end if;

  -- -------- 2. Validation des articles + verrouillage du stock --------
  -- Un premier passage verrouille chaque ligne produit (FOR UPDATE) pour éviter
  -- une survente en cas de commandes simultanées, valide la quantité et le stock,
  -- et calcule le total à partir du PRIX EN BASE (jamais celui envoyé par le client).
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    if not (v_item ? 'product_id') or not (v_item ? 'quantity') then
      raise exception 'Article invalide dans le panier';
    end if;

    begin
      v_quantity := (v_item->>'quantity')::integer;
    exception when others then
      raise exception 'Quantité invalide';
    end;

    if v_quantity is null or v_quantity <= 0 or v_quantity > 50 then
      raise exception 'Quantité invalide (doit être entre 1 et 50)';
    end if;

    select * into v_product
    from products
    where id = (v_item->>'product_id')::uuid
      and is_active = true
    for update;

    if not found then
      raise exception 'Produit introuvable ou indisponible';
    end if;

    if v_product.stock < v_quantity then
      raise exception 'Stock insuffisant pour "%" (disponible : %)', v_product.name, v_product.stock;
    end if;

    v_total := v_total + (v_product.price * v_quantity);
  end loop;

  -- -------- 3. Création de la commande (total recalculé serveur) --------
  insert into orders (id, customer_name, phone, commune, address_details, total)
  values (
    v_order_id,
    trim(p_customer_name),
    trim(p_phone),
    p_commune,
    nullif(trim(coalesce(p_address_details, '')), ''),
    v_total
  );

  -- -------- 4. Lignes de commande + décrément du stock --------
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_quantity := (v_item->>'quantity')::integer;

    select * into v_product from products where id = (v_item->>'product_id')::uuid;

    insert into order_items (order_id, product_id, product_name, unit_price, quantity)
    values (v_order_id, v_product.id, v_product.name, v_product.price, v_quantity);

    update products set stock = stock - v_quantity where id = v_product.id;
  end loop;

  return v_order_id;
end;
$$;

-- Seuls anon (visiteurs du site) et authenticated (admin dashboard, au cas où)
-- peuvent exécuter la fonction ; personne ne peut écrire directement dans les
-- tables grâce aux policies RLS ci-dessus.
revoke all on function public.create_order(text, text, text, text, jsonb, text) from public;
grant execute on function public.create_order(text, text, text, text, jsonb, text) to anon, authenticated;

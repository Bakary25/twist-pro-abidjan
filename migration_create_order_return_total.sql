-- ============================================
-- TWIST PRO ABIDJAN — create_order() renvoie désormais {id, total}
-- ============================================
-- À exécuter dans Supabase Dashboard > SQL Editor.
--
-- Contexte : jusqu'ici create_order() renvoyait juste l'uuid de la commande,
-- et script.js utilisait le total calculé CÔTÉ CLIENT (panier localStorage)
-- pour construire le message WhatsApp envoyé au vendeur. Si le prix d'un
-- produit changeait pendant qu'il était dans le panier d'un client, le total
-- affiché dans le message WhatsApp pouvait différer du total réellement
-- enregistré dans orders.total (recalculé côté serveur, toujours correct).
--
-- Ce script remplace create_order() par une version identique qui renvoie
-- {"id": uuid, "total": integer} au lieu d'un simple uuid. script.js (déjà
-- mis à jour dans le repo) utilise ce total pour le message WhatsApp.
--
-- Script idempotent, rejouable sans erreur.
-- ============================================

drop function if exists public.create_order(text, text, text, text, jsonb, text);

create or replace function public.create_order(
  p_customer_name text,
  p_phone text,
  p_commune text,
  p_address_details text,
  p_items jsonb,
  p_turnstile_token text
)
returns jsonb              -- {"id": uuid, "total": integer}
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

  return jsonb_build_object('id', v_order_id, 'total', v_total);
end;
$$;

revoke all on function public.create_order(text, text, text, text, jsonb, text) from public;
grant execute on function public.create_order(text, text, text, text, jsonb, text) to anon, authenticated;

-- Vérification : doit renvoyer returns="jsonb"
select p.proname, pg_get_function_result(p.oid) as returns
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'create_order';

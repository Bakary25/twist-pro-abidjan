-- ============================================
-- TWIST PRO ABIDJAN — Supprimer l'ancienne fonction create_order() à 5 paramètres
-- ============================================
-- À exécuter dans Supabase Dashboard > SQL Editor, APRÈS avoir lancé
-- cleanup_audit_test_data.sql.
--
-- Contexte : deux versions de create_order() coexistent actuellement en base :
--   - create_order(p_customer_name, p_phone, p_commune, p_address_details, p_items)
--     → ancienne version "de secours", posée en urgence pendant l'incident du
--       captcha à moitié implémenté. Elle ne valide NI la quantité (accepte des
--       quantités négatives ou nulles !), NI la commune, NI que le nom du client
--       soit renseigné, et n'a aucune limite sur le nombre d'articles.
--   - create_order(p_customer_name, p_phone, p_commune, p_address_details,
--     p_items, p_turnstile_token) → version actuelle de security_hardening.sql,
--     correctement validée et qui vérifie le jeton Turnstile côté serveur.
--
-- Le site (script.js, commit courant) appelle déjà exclusivement la version à
-- 6 paramètres. La version à 5 paramètres n'est plus appelée par le front, mais
-- reste exécutable par n'importe qui connaissant juste l'URL/clé anon (publique
-- par design) : elle permet de créer de fausses commandes, de gonfler le stock
-- avec des quantités négatives, ou de forcer une survente. Elle doit être
-- supprimée.
--
-- ⚠️ Vérifie d'abord que le widget Turnstile fonctionne bien sur le site avant
-- d'exécuter ce script : une fois la version à 5 paramètres supprimée, plus
-- personne ne pourra commander sans passer le contrôle anti-robot.
-- ============================================

drop function if exists public.create_order(text, text, text, text, jsonb);

-- Vérification : il ne doit rester qu'une seule fonction create_order, à 6 paramètres.
select p.proname, pg_get_function_arguments(p.oid) as arguments
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'create_order';

-- ============================================
-- TWIST PRO ABIDJAN — Inspection de l'état réel de la base (lecture seule)
-- ============================================
-- À exécuter dans Supabase Dashboard > SQL Editor. Ce script ne modifie rien,
-- il sert uniquement à comparer l'état réel de la base avec les fichiers du
-- repo (schema.sql / security_hardening.sql) dans le cadre de l'audit.
-- Colle-moi le résultat de chaque requête si tu veux que je l'analyse.
-- ============================================

-- 1. Toutes les fonctions create_order existantes (doit n'y en avoir qu'une
--    seule, à 6 paramètres, après exécution de fix_drop_legacy_create_order.sql)
select p.proname, pg_get_function_arguments(p.oid) as arguments, p.prosecdef as security_definer
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'create_order';

-- 2. Toutes les policies RLS sur les tables du site
select schemaname, tablename, policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
order by tablename, policyname;

-- 3. Grants réels sur les tables (compare avec RLS : qui peut faire quoi)
select table_schema, table_name, grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee in ('anon', 'authenticated')
order by table_name, grantee, privilege_type;

-- 4. Droits d'exécution sur les fonctions RPC
select routine_schema, routine_name, grantee, privilege_type
from information_schema.role_routine_grants
where routine_schema = 'public'
order by routine_name, grantee;

-- 5. Extensions installées (doit inclure "http" si le Turnstile server-side est actif)
select extname, extversion, extnamespace::regnamespace as schema
from pg_extension
order by extname;

-- 6. Le secret Turnstile est-il configuré dans Vault ? (ne révèle pas la valeur)
select name, created_at, updated_at
from vault.secrets
where name = 'turnstile_secret_key';

-- 7. Policies de stockage sur le bucket product-images
select policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'storage' and tablename = 'objects';

-- 8. Config du bucket (public, limites de taille/type de fichier)
select id, name, public, file_size_limit, allowed_mime_types
from storage.buckets;

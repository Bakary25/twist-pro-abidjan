-- ============================================
-- TWIST PRO ABIDJAN — Nettoyage des données de test de l'audit
-- ============================================
-- À exécuter dans Supabase Dashboard > SQL Editor.
-- Contexte : des tests d'entrées hostiles sur create_order() (RPC anon) ont révélé
-- que la fonction à 5 paramètres actuellement en production ne valide ni la
-- quantité (> 0), ni la commune, ni le nom du client. Plusieurs appels de test
-- ont donc réellement inséré des commandes et modifié le stock du produit
-- "Box médium" (id 28e7b34f-b805-4075-a2b7-278c29b0be8b) : stock passé de 10 à 2.
--
-- Ce script : 1) vérifie l'état avant nettoyage, 2) supprime les commandes de
-- test, 3) restaure le stock à 10, 4) vérifie l'état après.
-- ============================================

-- -------- 1. Vérification avant nettoyage (à lire avant de continuer) --------

select id, customer_name, phone, commune, address_details, total, status, created_at
from orders
where id in (
  '4e5465ef-98fa-4b18-9f91-de3974ce7bea',
  'aae62061-6a3f-4918-a35d-00f3c8157361',
  'f9063d01-843e-4df9-98c2-ddb59eab2b11',
  'e6a60215-b53c-4f9b-94d1-91df50be30f9',
  '8c71be33-cebd-4e79-a51d-a878e40da38a'
);

select id, name, stock from products where id = '28e7b34f-b805-4075-a2b7-278c29b0be8b';
-- stock attendu ici : 2 (faussé par les tests). Doit redevenir 10 après ce script.


-- -------- 2. Suppression des lignes de commande de test --------

delete from order_items
where order_id in (
  '4e5465ef-98fa-4b18-9f91-de3974ce7bea',
  'aae62061-6a3f-4918-a35d-00f3c8157361',
  'f9063d01-843e-4df9-98c2-ddb59eab2b11',
  'e6a60215-b53c-4f9b-94d1-91df50be30f9',
  '8c71be33-cebd-4e79-a51d-a878e40da38a'
);

delete from orders
where id in (
  '4e5465ef-98fa-4b18-9f91-de3974ce7bea',
  'aae62061-6a3f-4918-a35d-00f3c8157361',
  'f9063d01-843e-4df9-98c2-ddb59eab2b11',
  'e6a60215-b53c-4f9b-94d1-91df50be30f9',
  '8c71be33-cebd-4e79-a51d-a878e40da38a'
);


-- -------- 3. Restauration du stock réel (10 avant les tests) --------

update products
set stock = 10
where id = '28e7b34f-b805-4075-a2b7-278c29b0be8b';


-- -------- 4. Vérification après nettoyage --------

select count(*) as commandes_test_restantes
from orders
where id in (
  '4e5465ef-98fa-4b18-9f91-de3974ce7bea',
  'aae62061-6a3f-4918-a35d-00f3c8157361',
  'f9063d01-843e-4df9-98c2-ddb59eab2b11',
  'e6a60215-b53c-4f9b-94d1-91df50be30f9',
  '8c71be33-cebd-4e79-a51d-a878e40da38a'
);
-- doit retourner 0

select id, name, stock from products where id = '28e7b34f-b805-4075-a2b7-278c29b0be8b';
-- stock doit valoir 10

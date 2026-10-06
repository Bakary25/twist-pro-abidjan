# Audit — Twist Pro Abidjan

Date : 2026-10-04 · Repo `Bakary25/twist-pro-abidjan` @ `main`

## Résumé

Le site fonctionne et les protections RLS/Auth de base sont solides (orders, order_items,
écritures anonymes sur products/categories, storage, inscription publique : tout correctement
bloqué). Les trois problèmes critiques identifiés sont **tous corrigés et vérifiés** au
2026-10-04 : l'ancienne fonction `create_order()` sans validation a été supprimée, le site a été
redéployé (`.git`/`*.sql` ne sont plus exposés, les en-têtes de sécurité CSP/HSTS sont actifs), et
le dashboard authentifié a été testé de bout en bout (commandes, produits avec upload photo,
catégories, statistiques) sans anomalie. Le code applicatif (script.js, dashboard.js) est propre
et bien protégé contre le XSS. Les trois améliorations "Important" (total WhatsApp, panier
obsolète, contraste du doré) sont codées, migrées en base et déployées. Une comparaison complète
policies RLS / grants / fonctions réels vs repo (8 requêtes SQL) ne montre aucun écart avec
`security_hardening.sql` ; deux points mineurs de durcissement supplémentaires ont été identifiés
(grants de base larges sur les tables, bucket storage sans limite de taille/type de fichier).

## Tableau des problèmes

| # | Sévérité | Où | Comment le reproduire | Correction |
|---|---|---|---|---|
| 1 | **Critique — corrigé ✅** | Déploiement Cloudflare | `curl https://twistproabidjan.com/.git/config` → 200, contenu réel du repo. Idem `.git/HEAD`, `.git/logs/HEAD`, `.git/index`, `.git/description`, `.git/refs/heads/main`, et `/schema.sql` (200, dump complet du schéma) | **Corrigé le 2026-10-04** : `.assetsignore` ajouté, site redéployé (`npx wrangler deploy --name=twist-pro-abidjan`). Revérifié : tous ces chemins renvoient 404. Incident annexe pendant le déploiement : `wrangler` a lui-même créé un dossier `.wrangler/cache/` local qui s'est retrouvé uploadé par erreur au premier essai (exposant l'ID de compte Cloudflare, pas un secret) — corrigé en complétant `.assetsignore` (+ `.wrangler/`, `node_modules/`, `*.md`) et en redéployant ; revérifié à 404 |
| 2 | **Critique — corrigé ✅** | Supabase, fonction `create_order` | Appel direct à l'API REST avec la clé anon (publique) et 5 paramètres (sans `p_turnstile_token`) : quantité négative acceptée → augmente le stock ; quantité 0 acceptée ; commune invalide acceptée ; nom client vide accepté ; pas de limite d'articles vérifiée | **Corrigé le 2026-10-04** : `fix_drop_legacy_create_order.sql` exécuté. Revérifié par API : l'appel à 5 paramètres renvoie désormais « fonction introuvable », seule la version à 6 paramètres (avec vérification Turnstile serveur) répond |
| 3 | **Critique — corrigé ✅** | Déploiement | Le live déployé correspondait au commit `ce5760c`, 3 commits derrière `main`. Résultat : pas de Turnstile actif, dashboard encore en `onclick` inline, pas de section Statistiques, et `_headers` pas déployé (aucune CSP/HSTS/X-Frame-Options active) | **Corrigé le 2026-10-04** (même redéploiement que #1). Revérifié : `script.js` servi est identique au repo (diff vide), `dashboard.js` utilise `data-action` (0 `onclick`), CSP/HSTS/X-Frame-Options/Referrer-Policy/Permissions-Policy tous présents sur `curl -I`, Turnstile et section Statistiques visibles |
| 4 | Important | Déploiement | Pas de `wrangler.toml`/`.json` dans le repo, ni de `package.json` → le déploiement dépend entièrement d'une configuration Cloudflare Dashboard non versionnée (asset directory, build command). Impossible de savoir d'où venait l'upload de `.git/` sans ça | Recommandation seulement (pas appliqué, risque de casser le déploiement actuel si mal configuré) |
| 5 | Important — corrigé ✅ | `script.js`, `submitOrder()` | Le total affiché dans le message WhatsApp était calculé **côté client** à partir du prix au moment de l'ajout au panier (`cartTotal()`), alors que `create_order()` recalcule le vrai total **côté serveur** avec le prix actuel. Si un prix changeait pendant qu'un article était dans le panier (panier persistant via localStorage), le total envoyé au vendeur par WhatsApp pouvait différer du total réellement enregistré dans `orders.total` | **Codé** : `create_order()` renvoie désormais `{"id": uuid, "total": integer}` au lieu d'un simple `uuid` ; `script.js` utilise ce total pour le message WhatsApp. Committé localement. **⚠️ Pas encore déployé/migré** — voir recommandations, l'ordre d'exécution est important |
| 6 | Important — corrigé ✅ | `script.js`, panier localStorage | Un produit désactivé ou épuisé après avoir été ajouté au panier n'était jamais retiré automatiquement de `state.cart` (jamais recoupé avec `state.products` après `loadProducts()`). Le client voyait l'article indéfiniment dans son panier, et la tentative de commande échouait avec un message générique sans dire lequel — bloqué sans solution évidente autre que vider tout son panier | **Codé** : `reconcileCart()` purge/plafonne `state.cart` à chaque chargement du catalogue par rapport aux produits actifs, et prévient le client via un bandeau dans le panier si celui-ci a été modifié. Committé localement, pas encore déployé |
| 7 | Important — corrigé ✅ | `style.css`, couleur `--gold` | `#C68A3F` sur blanc = ratio de contraste **2.95:1**, sous le seuil WCAG AA (4.5:1 texte normal / 3:1 grand texte). Utilisé notamment pour **le prix des produits** (`.product-price`), élément clé de la page | **Codé** : nouvelle variable `--gold-text: #9D6C2F` (≈4.55:1) utilisée pour `.product-price` et `.hero-eyebrow` ; `--gold` conservé pour le logo et le titre hero (décoratifs/larges) et sur fond sombre (footer, déjà à 6.39:1). Committé localement, pas encore déployé |
| 8 | Important | Supabase, RPC `create_order` | Pas de limite de débit par téléphone/IP au-delà de Turnstile. Une fois le correctif #2 appliqué et Turnstile pleinement actif en prod, le risque de spam de masse est réduit mais pas nul | Recommandation pour plus tard, pas d'implémentation demandée |
| 9 | Important — vérifié ✅ | Storage `product-images` | Policies de bucket configurées uniquement dans le Dashboard Supabase, aucune trace dans le repo | **Vérifié le 2026-10-05** via `audit_inspect_db_state.sql` (requête 7) : 3 policies propres — lecture publique scopée au bucket, upload/delete restreints au JWT de l'email admin exact (plus strict qu'un simple `authenticated`). Toujours pas versionné dans le repo (recommandation #6) |
| 10 | Mineur | `script.js`, erreurs réseau | Une erreur Postgres technique brute (ex. `p_items` malformé → "cannot get array length of a non-array") pouvait s'afficher telle quelle au client | **Appliqué** : seules les erreurs métier (code `P0001`, déjà rédigées en français) sont affichées ; sinon message générique |
| 11 | Mineur | Formulaire de commande | Pas de validation de format téléphone, pas de `maxlength` sur nom/téléphone/adresse | **Appliqué** : pattern tolérant pour numéros ivoiriens (avec/sans +225), `maxlength` 100/20/300 |
| 12 | Mineur | `index.html`/`dashboard.html` | Aucun favicon (404 sur `/favicon.ico`) | **Appliqué** : favicon.ico + PNG + apple-touch-icon générés aux couleurs de la marque |
| 13 | Mineur | `images/hero-product.png` | 572 Ko en PNG, sans variante optimisée, pas de `fetchpriority` sur l'image LCP | **Appliqué** : version WebP générée (48 Ko, -92%) via `<picture>` avec fallback PNG, `fetchpriority="high"` + dimensions explicites |
| 14 | Mineur | `_headers` | Pas de cache longue durée pour les images statiques | **Appliqué** : `/images/*` → cache 30 jours (`immutable`) |
| 15 | Mineur | `index.html` | Balises `twitter:title`/`twitter:description`/`twitter:image` absentes (seul `twitter:card` présent) | **Appliqué** |
| 16 | Info | `script.js`, `stepQty()` | Si appelée avec un `delta` différent de ±1 sur un article neuf, la quantité ajoutée est codée en dur à 1 au lieu du delta réel. **Non atteignable via l'UI réelle** (les boutons n'envoient que ±1) — signalé pour information, aucun correctif nécessaire |
| 17 | Mineur — vérifié | Supabase, grants de base | `audit_inspect_db_state.sql` (requête 3) confirme que `anon`/`authenticated` ont tous les droits (SELECT/INSERT/UPDATE/DELETE/...) sur toutes les tables publiques, y compris `orders`/`order_items` — comportement par défaut Supabase, **RLS est donc l'unique ligne de défense**. Si RLS était désactivé par erreur sur une table, elle deviendrait instantanément ouverte à tous | Non appliqué : `revoke` explicite des droits inutiles pour `anon` sur `orders`/`order_items`, et limiter `anon` à `SELECT` sur `products`/`categories`, pour de la défense en profondeur |
| 18 | Mineur — vérifié | Storage `product-images`, config du bucket | `audit_inspect_db_state.sql` (requête 8) : `file_size_limit` et `allowed_mime_types` sont `NULL` — aucune limite de taille ni de type de fichier côté bucket (seul un admin authentifié peut uploader, donc risque faible) | Non appliqué : fixer une limite de taille (ex. 5 Mo) et restreindre aux types image (`image/png`, `image/jpeg`, `image/webp`) dans la config du bucket |

## Ce qui a été testé et qui fonctionne

- **Dashboard authentifié** (identifiants fournis par le propriétaire) :
  - Connexion avec les vrais identifiants → dashboard affiché ; déconnexion → écran de connexion, et **session réellement invalidée** (revérifié après rechargement, pas juste un changement d'affichage côté client) ; rechargement en cours de session → session conservée
  - 40 commandes réelles chargées, stats en tête exactes (124 000 FCFA de CA, 20 livrées) ; filtre par statut testé (`livree` → 20/20, conforme) ; aucun `<script>` injecté dans le HTML généré pour la liste
  - Confirmation que les 5 commandes de test de l'incident (voir plus bas) ont bien été supprimées (recherche par id et par téléphone `0000000000` → aucun résultat)
  - **Catégories** : ajout avec accents (« Accessoires bébé » → slug `accessoires-bebe` correctement généré sans accent) → apparaît immédiatement comme pastille sur le site public ; doublon correctement rejeté avec message clair ; suppression d'une catégorie contenant un produit → le produit est conservé avec `category_id = null` (`on delete set null` fonctionne), affiché `—` dans le dashboard, toujours visible dans « Tous » côté public
  - **Produits** : création d'un produit de test sans image (affiche le placeholder `?` dans le dashboard, placeholder générique côté public) ; édition du prix, prix barré, stock et upload d'une vraie photo (fichier JPEG) → URL Supabase Storage générée et accessible, changements reflétés côté public après rechargement ; suppression du produit → disparaît du dashboard et du site public. Suppression manuelle de l'image de test dans Storage (confirme qu'un compte admin authentifié *peut* supprimer un objet Storage — les policies de delete sont donc bien restrictives à `authenticated`, pas ouvertes)
  - **Statistiques** : recalculées indépendamment à partir des mêmes données brutes (`order_items`) et comparées à l'affichage → total des ventes, top produit (« Twist pro », 20 unités, 124 000 FCFA) et liste des produits jamais vendus **exactement identiques**. Note : la suppression d'un produit ne supprime pas son image dans Storage (fichier orphelin) — mineur, à surveiller avec le temps
- **RLS `orders`/`order_items`** : lecture anonyme → `[]`, insert/update/delete anonymes → tous bloqués (`42501` ou 0 ligne affectée)
- **RLS `products`/`categories`** : lecture publique limitée aux produits actifs (6/6, 0 inactif visible), écriture anonyme bloquée (insert → `42501`, update testé sur un vrai produit → 0 ligne modifiée, prix inchangé vérifié)
- **Storage `product-images`** : upload anonyme bloqué (`403`, violation RLS), lecture publique OK
- **Auth** : inscription publique désactivée (`disable_signup: true`), mauvais mot de passe → message générique propre, pas d'accès dashboard
- **Dashboard sans session** : écran de connexion affiché, dashboard cache (`display:none`), aucune fuite de données même en forçant l'affichage (RLS bloque les requêtes quoi qu'il arrive)
- **Catalogue — bug historique des cartes invisibles** : changement de catégorie répété 8 fois dans tous les sens (tous/box/twists/accessoires) → les produits réapparaissent toujours correctement, jamais de grille vide à tort. **Le bug ne se reproduit pas**, le code CSS (`animation: fadeInUp ... both`) est sain
- **Panier** : stepper plafonné au stock réel (testé jusqu'à 12 clics vs stock 9 → plafonné à 9), décrément jusqu'à 0 retire bien l'article, persistance localStorage confirmée après rechargement
- **Message WhatsApp** : encodage correct testé avec accents, guillemets, retour à la ligne et emoji dans les champs ; numéro et format corrects
- **`create_order` — entrées hostiles** (sur la fonction 6 paramètres avec Turnstile) : jeton Turnstile invalide → correctement rejeté côté serveur (vrai appel à l'API Cloudflare siteverify confirmé, pas un simple no-op) ; panier vide, `p_items` malformé, produit inexistant → tous rejetés avec un message propre
- Pas de référence morte à Netlify, pas de `lorem ipsum`/TODO oubliés, pas de `console.log` de debug
- Ancres `#produits`, `#comment-ca-marche`, `#contact` toutes valides
- `escapeHtml()` utilisé systématiquement dans `script.js` et `dashboard.js`, y compris dans les attributs — pas de faille XSS trouvée dans le code revu

## Ce qui n'a pas pu être testé

- **Commande réelle de bout en bout via le site public** : non testée. D'abord évitée après l'incident de nettoyage pour ne pas créer plus de données de test ; puis, une fois le redéploiement fait, **plus possible de la simuler par API** — le widget Turnstile (réel, avec vérification serveur) bloque désormais toute création de commande qui ne passe pas par une interaction humaine réelle dans le navigateur. C'est plutôt une bonne nouvelle (la protection anti-spam fonctionne), mais ça veut dire qu'une commande réelle de bout en bout (y compris le test XSS sur le nom client en conditions réelles) nécessiterait que tu la fasses toi-même, ou que je tente de résoudre Turnstile en navigation pilotée (pas garanti de fonctionner)
- **Captures d'écran visuelles** (desktop et mobile) : la fenêtre Chrome pilotée tournait en arrière-plan dans cet environnement (`document.hidden`), ce qui a bloqué systématiquement la capture d'écran (timeout), même après que tu l'aies mise au premier plan de ton côté. Tous les tests UI ont donc été faits par inspection DOM/JS/réseau plutôt que visuellement
- **Émulation mobile réelle (390×844)** : le redimensionnement de fenêtre plafonnait à ~619px de large dans cet environnement — pas de vraie émulation d'appareil disponible. Seule l'absence de débordement horizontal a pu être vérifiée (à 619px, aucun débordement)
- **Lighthouse** (performance/accessibilité/SEO) : pas d'outil Lighthouse disponible dans cette session
- **Safari iOS / Firefox** : seul Chromium était piloté
- **Suppression d'un objet existant dans le bucket Storage par un anonyme** : non testée pour ne pas risquer de supprimer une vraie photo produit si la policy s'avérait mal configurée. Confirmé indirectement par `audit_inspect_db_state.sql` (requête 7) : la policy `admin_delete_product_images` restreint `DELETE` au JWT de l'email admin — un anonyme n'a aucune policy `DELETE` qui le couvre, donc bloqué par défaut (RLS deny-by-default)

## ⚠️ Incident pendant l'audit (déjà traité)

En testant des entrées hostiles sur `create_order`, j'ai découvert que la fonction à 5 paramètres
alors active en prod n'avait quasiment aucune validation (voir #2). Plusieurs tests qui auraient dû
être rejetés ont créé 5 vraies commandes de test et modifié le stock réel de "Box médium"
(10 → 2 via une combinaison de quantités négatives/excessives). Script de nettoyage fourni
(`cleanup_audit_test_data.sql`) — stock vérifié à 10 lors des tests navigateur suivants, donc
**apparemment déjà exécuté de ton côté**. Vérifie avec la section 1 de `cleanup_audit_test_data.sql`
que les 5 commandes de test n'existent plus si tu veux une confirmation définitive.

## Recommandations, par ordre de priorité

1. ~~Exécuter `fix_drop_legacy_create_order.sql`~~ **Fait le 2026-10-04**, vérifié par API
2. ~~Redéployer le site~~ **Fait le 2026-10-04**, vérifié (`.git`/SQL 404, en-têtes de sécurité actifs, code à jour)
3. ~~Confirmer le nettoyage des données de test~~ **Fait**, vérifié dans le dashboard (les 5 commandes de test n'existent plus)
4. ~~Implémenter les 3 correctifs "Important"~~ **Fait et déployé le 2026-10-04** (#5, #6, #7) :
   `migration_create_order_return_total.sql` exécuté par le propriétaire, puis redéploiement
   (même commande que précédemment). Revérifié : `script.js`/`style.css`/`index.html` servis
   identiques au repo, la fonction `create_order` à 6 paramètres résout toujours correctement
   (rejette un faux jeton Turnstile), `.git` toujours inaccessible, en-têtes de sécurité toujours
   actifs. Seule la forme exacte du retour `{id, total}` n'a pas pu être revérifiée par API (un
   appel réussi nécessite de passer Turnstile, impossible à simuler) — à confirmer par toi lors
   d'une vraie commande
5. ~~Lancer `audit_inspect_db_state.sql` et comparer policies/grants réels avec le repo~~ **Fait le
   2026-10-05** (8 requêtes passées une à une). Résultat : tout est conforme à `security_hardening.sql`
   (une seule fonction `create_order`, 7 policies RLS exactes, droits d'exécution limités à
   `create_order`, extensions `http`/`supabase_vault` présentes, secret Turnstile configuré,
   policies storage correctement scopées — même plus strictes que prévu, restreintes au JWT de
   l'email admin). Deux points mineurs relevés en plus (#17, #18) : grants de base larges sur
   toutes les tables (RLS = seule barrière, standard Supabase) et bucket storage sans limite de
   taille/type de fichier
6. Écrire les policies storage dans un fichier SQL versionné (actuellement seulement dans le
   Dashboard — voir #9) et resserrer les grants de base + la config du bucket (#17, #18)
7. Ajouter un `wrangler.toml` versionné pour rendre le déploiement reproductible (actuellement
   dépendant d'une config Cloudflare Dashboard non trackée) — maintenant qu'on connaît le nom
   exact du projet (`twist-pro-abidjan`) et sa date de compatibilité (`2026-09-30`), c'est facile à écrire
8. Surveiller la pause automatique du projet Supabase gratuit par inactivité — si la boutique
   devient active, envisager un plan payant ou un ping de keep-alive pour éviter une interruption
   de service surprise
9. Envisager un nettoyage périodique des images orphelines dans le bucket Storage (une image
   reste après suppression du produit qui l'utilisait)

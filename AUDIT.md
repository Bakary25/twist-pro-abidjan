# Audit — Twist Pro Abidjan

Date : 2026-10-04 · Repo `Bakary25/twist-pro-abidjan` @ `main`

## Résumé

Le site fonctionne et les protections RLS/Auth de base sont solides (orders, order_items,
écritures anonymes sur products/categories, storage, inscription publique : tout correctement
bloqué). Mais trois problèmes critiques réduisent fortement la sécurité et la confiance qu'on
peut avoir dans l'état actuel : le dossier `.git` et les fichiers SQL sont exposés publiquement,
une ancienne fonction `create_order()` sans aucune validation coexiste en base avec la version
sécurisée et peut être appelée directement (stock falsifiable, fausses commandes), et le site
en production a 3 commits de retard sur `main` (donc aucun des correctifs de sécurité déjà
écrits n'est réellement actif aujourd'hui). Le code applicatif (script.js, dashboard.js) est
globalement propre et bien protégé contre le XSS. Plusieurs correctifs sans risque sont déjà
appliqués et committés ; les actions critiques restantes demandent ton feu vert ou ton exécution
manuelle en base.

## Tableau des problèmes

| # | Sévérité | Où | Comment le reproduire | Correction |
|---|---|---|---|---|
| 1 | **Critique** | Déploiement Cloudflare | `curl https://twistproabidjan.com/.git/config` → 200, contenu réel du repo. Idem `.git/HEAD`, `.git/logs/HEAD`, `.git/index`, `.git/description`, `.git/refs/heads/main`, et `/schema.sql` (200, dump complet du schéma) | **Appliqué** : `.assetsignore` ajouté (exclut `.git` et `*.sql` des assets). **Effectif seulement après un nouveau déploiement** — voir recommandations |
| 2 | **Critique** | Supabase, fonction `create_order` | Appel direct à l'API REST avec la clé anon (publique) et 5 paramètres (sans `p_turnstile_token`) : quantité négative acceptée → augmente le stock ; quantité 0 acceptée ; commune invalide acceptée ; nom client vide accepté ; pas de limite d'articles vérifiée | Script **écrit, à exécuter par toi** : `fix_drop_legacy_create_order.sql` (supprime l'ancienne fonction à 5 paramètres) |
| 3 | **Critique** | Déploiement | Le live déployé correspond au commit `ce5760c`, 3 commits derrière `main` (confirmé via `.git/refs/heads/main` exposé). Résultat : pas de Turnstile actif, dashboard encore en `onclick` inline (incompatible avec la CSP prévue), pas de section Statistiques, et **`_headers` n'est pas déployé** → aucune CSP/HSTS/X-Frame-Options active aujourd'hui en prod (vérifié par `curl -I`) | Recommandation : redéployer (voir priorités) |
| 4 | Important | Déploiement | Pas de `wrangler.toml`/`.json` dans le repo, ni de `package.json` → le déploiement dépend entièrement d'une configuration Cloudflare Dashboard non versionnée (asset directory, build command). Impossible de savoir d'où venait l'upload de `.git/` sans ça | Recommandation seulement (pas appliqué, risque de casser le déploiement actuel si mal configuré) |
| 5 | Important | `script.js`, `submitOrder()` | Le total affiché dans le message WhatsApp est calculé **côté client** à partir du prix au moment de l'ajout au panier (`cartTotal()`), alors que `create_order()` recalcule le vrai total **côté serveur** avec le prix actuel. Si un prix change pendant qu'un article est dans le panier (panier persistant via localStorage), le total envoyé au vendeur par WhatsApp peut différer du total réellement enregistré dans `orders.total` | Proposé, pas appliqué : faire retourner `{id, total}` par `create_order()` au lieu d'un simple `uuid`, et utiliser ce total pour le message WhatsApp. Dis-moi si tu veux que je l'implémente (ça change le type de retour de la fonction RPC) |
| 6 | Important | `script.js`, panier localStorage | Un produit désactivé ou épuisé après avoir été ajouté au panier n'est jamais retiré automatiquement de `state.cart` (qui n'est jamais recoupé avec `state.products` après `loadProducts()`). Le client voit l'article indéfiniment dans son panier, et la tentative de commande échoue avec un message générique ("Produit introuvable ou indisponible") sans dire lequel — le client est bloqué sans solution évidente autre que vider tout son panier | Proposé, pas appliqué : purger/ajuster `state.cart` à chaque `loadProducts()` par rapport aux produits actifs, et prévenir l'utilisateur si un article a été retiré. Dis-moi si je l'implémente |
| 7 | Important | `style.css`, couleur `--gold` | `#C68A3F` sur blanc = ratio de contraste **2.95:1**, sous le seuil WCAG AA (4.5:1 texte normal / 3:1 grand texte). Utilisé notamment pour **le prix des produits** (`.product-price`), élément clé de la page | Proposé, pas appliqué : une nuance plus sombre pour le texte, ex. `#9D6C2F` (≈4.55:1), en gardant `#C68A3F` pour les éléments décoratifs/larges (titre hero). Dis-moi si je l'applique |
| 8 | Important | Supabase, RPC `create_order` | Pas de limite de débit par téléphone/IP au-delà de Turnstile. Une fois le correctif #2 appliqué et Turnstile pleinement actif en prod, le risque de spam de masse est réduit mais pas nul | Recommandation pour plus tard, pas d'implémentation demandée |
| 9 | Important | Storage `product-images` | Policies de bucket (upload/delete anonyme, limites de taille/type MIME) configurées uniquement dans le Dashboard Supabase, aucune trace dans le repo | Non testable sans risquer de supprimer une vraie photo produit (voir "non testé"). `audit_inspect_db_state.sql` interroge `storage.buckets`/`pg_policies` pour objectiver l'état réel |
| 10 | Mineur | `script.js`, erreurs réseau | Une erreur Postgres technique brute (ex. `p_items` malformé → "cannot get array length of a non-array") pouvait s'afficher telle quelle au client | **Appliqué** : seules les erreurs métier (code `P0001`, déjà rédigées en français) sont affichées ; sinon message générique |
| 11 | Mineur | Formulaire de commande | Pas de validation de format téléphone, pas de `maxlength` sur nom/téléphone/adresse | **Appliqué** : pattern tolérant pour numéros ivoiriens (avec/sans +225), `maxlength` 100/20/300 |
| 12 | Mineur | `index.html`/`dashboard.html` | Aucun favicon (404 sur `/favicon.ico`) | **Appliqué** : favicon.ico + PNG + apple-touch-icon générés aux couleurs de la marque |
| 13 | Mineur | `images/hero-product.png` | 572 Ko en PNG, sans variante optimisée, pas de `fetchpriority` sur l'image LCP | **Appliqué** : version WebP générée (48 Ko, -92%) via `<picture>` avec fallback PNG, `fetchpriority="high"` + dimensions explicites |
| 14 | Mineur | `_headers` | Pas de cache longue durée pour les images statiques | **Appliqué** : `/images/*` → cache 30 jours (`immutable`) |
| 15 | Mineur | `index.html` | Balises `twitter:title`/`twitter:description`/`twitter:image` absentes (seul `twitter:card` présent) | **Appliqué** |
| 16 | Info | `script.js`, `stepQty()` | Si appelée avec un `delta` différent de ±1 sur un article neuf, la quantité ajoutée est codée en dur à 1 au lieu du delta réel. **Non atteignable via l'UI réelle** (les boutons n'envoient que ±1) — signalé pour information, aucun correctif nécessaire |

## Ce qui a été testé et qui fonctionne

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

- **Dashboard authentifié** (commandes, produits, catégories, upload photo, statistiques) : nécessite tes identifiants admin. Je n'ai pas voulu te les demander avant d'avoir fini le reste pour ne pas bloquer l'audit — dis-moi si tu veux que je les teste maintenant
- **Commande réelle de bout en bout** : évitée après l'incident de nettoyage (voir plus bas) pour ne pas créer plus de données de test. Faisable sur demande, avec nettoyage ensuite
- **Captures d'écran visuelles** (desktop et mobile) : la fenêtre Chrome pilotée tournait en arrière-plan dans cet environnement (`document.hidden`), ce qui a bloqué systématiquement la capture d'écran (timeout), même après que tu l'aies mise au premier plan de ton côté. Tous les tests UI ont donc été faits par inspection DOM/JS/réseau plutôt que visuellement
- **Émulation mobile réelle (390×844)** : le redimensionnement de fenêtre plafonnait à ~619px de large dans cet environnement — pas de vraie émulation d'appareil disponible. Seule l'absence de débordement horizontal a pu être vérifiée (à 619px, aucun débordement)
- **Lighthouse** (performance/accessibilité/SEO) : pas d'outil Lighthouse disponible dans cette session
- **Safari iOS / Firefox** : seul Chromium était piloté
- **Suppression d'un objet existant dans le bucket Storage par un anonyme** : non testée pour ne pas risquer de supprimer une vraie photo produit si la policy s'avérait mal configurée
- **Comparaison exacte policies RLS / grants réels vs repo** : nécessite un accès SQL direct que je n'ai pas. Script `audit_inspect_db_state.sql` fourni (lecture seule) — lance-le et partage-moi le résultat si tu veux que je l'analyse

## ⚠️ Incident pendant l'audit (déjà traité)

En testant des entrées hostiles sur `create_order`, j'ai découvert que la fonction à 5 paramètres
alors active en prod n'avait quasiment aucune validation (voir #2). Plusieurs tests qui auraient dû
être rejetés ont créé 5 vraies commandes de test et modifié le stock réel de "Box médium"
(10 → 2 via une combinaison de quantités négatives/excessives). Script de nettoyage fourni
(`cleanup_audit_test_data.sql`) — stock vérifié à 10 lors des tests navigateur suivants, donc
**apparemment déjà exécuté de ton côté**. Vérifie avec la section 1 de `cleanup_audit_test_data.sql`
que les 5 commandes de test n'existent plus si tu veux une confirmation définitive.

## Recommandations, par ordre de priorité

1. **Exécuter `fix_drop_legacy_create_order.sql`** après avoir vérifié que le widget Turnstile
   fonctionne bien sur le site (sinon plus personne ne pourra commander une fois l'ancienne
   fonction supprimée) — referme la faille #2, la plus grave
2. **Redéployer le site** (`npx wrangler deploy` ou push déclenchant le build Cloudflare) — le
   `.assetsignore` ajouté ne prend effet qu'au prochain déploiement, et c'est aussi le seul moyen
   d'activer enfin `_headers` (CSP/HSTS/etc. inactifs en prod actuellement) et le reste des
   correctifs déjà sur `main`
3. Confirmer le nettoyage des données de test (section 1 de `cleanup_audit_test_data.sql`)
4. Lancer `audit_inspect_db_state.sql` dans le SQL Editor et me partager le résultat pour que je
   compare policies/grants réels avec les fichiers du repo
5. Me dire si j'implémente les 3 correctifs proposés mais pas appliqués : total WhatsApp recalculé
   depuis le serveur (#5), purge du panier obsolète (#6), contraste du doré sur les prix (#7)
6. Ajouter un `wrangler.toml` versionné pour rendre le déploiement reproductible (actuellement
   dépendant d'une config Cloudflare Dashboard non trackée)
7. Surveiller la pause automatique du projet Supabase gratuit par inactivité — si la boutique
   devient active, envisager un plan payant ou un ping de keep-alive pour éviter une interruption
   de service surprise
8. Quand tu es prêt : donne-moi tes identifiants admin dashboard pour finir les tests (produits,
   catégories, stats) et faire une commande réelle de bout en bout avec nettoyage ensuite

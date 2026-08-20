# Gestion Cahiers — Stock & Facturation

Vraie application de gestion (pas un fichier Excel) pour une librairie/papeterie :
stock en temps réel, conversion automatique **carton → paquet → pièce**, entrées,
sorties (client/commerce/librairie/autre), ventes avec facturation automatique,
historique complet des mouvements, alertes de stock faible, tableau de bord,
gestion des utilisateurs par rôle.

Construite pour évoluer : ajouter demain les stylos, livres, rames, cartons, etc.
ne demande qu'un nouveau produit — jamais de refonte du logiciel.

## Stack

- **Backend** : Node.js + Express + SQLite (`better-sqlite3`) — une seule base de
  données fichier, pas de service externe à payer.
- **Frontend** : HTML/CSS/JS "vanilla" (aucune étape de build), servi directement
  par Express. Fonctionne sur mobile comme sur desktop.
- **Auth** : JWT + mots de passe hashés (bcrypt), 3 rôles (admin / magasinier / caissier).

## Déploiement (100% depuis un téléphone, comme d'habitude)

**1. Mettre le code sur GitHub**
   Crée un nouveau dépôt sur github.com (interface web) et téléverse tous les
   fichiers de ce projet (bouton "Add file → Upload files", tu peux glisser tout
   le dossier).

**2. Déployer sur Railway**
   - railway.app → New Project → Deploy from GitHub repo → sélectionne le dépôt.
   - Railway détecte automatiquement Node.js (`package.json`) et lance `npm install`
     puis `npm start`.
   - Dans **Variables**, ajoute :
     - `JWT_SECRET` — une longue chaîne aléatoire (obligatoire en production)
     - `ADMIN_EMAIL` — email du compte administrateur (optionnel, défaut `admin@librairie.cm`)
     - `ADMIN_PASSWORD` — mot de passe admin (optionnel, défaut `admin123`, **à changer**)
   - Important : la base SQLite est un fichier (`data/gestion.db`). Sur Railway,
     ajoute un **Volume** (Settings → Volumes) monté sur `/app/data` pour que le
     stock ne soit pas effacé à chaque redéploiement.

**3. Créer le compte administrateur**
   Une fois déployé, ouvre l'onglet "Deploy Logs" puis dans Railway va dans
   **Settings → un "Shell" éphémère n'existe pas sur le plan gratuit** — la
   solution la plus simple depuis le mobile : ajoute une variable `RUN_SEED=1`
   n'est pas nécessaire, le plus simple est d'exécuter le script une fois via la
   commande de démarrage. Remplace temporairement la commande de démarrage
   (Settings → Deploy → Custom Start Command) par :
   ```
   node seed.js && node server.js
   ```
   Redéploie une fois — le compte admin et 5 produits de démonstration sont créés.
   Tu peux ensuite remettre `node server.js` seul si tu préfères (le seed ne
   duplique jamais un compte existant, donc tu peux aussi le laisser tel quel).

**4. Se connecter**
   Ouvre l'URL Railway générée → connecte-toi avec `ADMIN_EMAIL` / `ADMIN_PASSWORD`.

## Logique métier clé

- **Conversion carton → paquet → pièce** : chaque produit définit
  `piece_par_paquet` et `paquet_par_carton`. Une entrée ou une sortie de
  "2 cartons + 3 paquets + 4 pièces" est automatiquement convertie en pièces
  selon CE produit, puis le stock (toujours stocké en pièces) est mis à jour.
- **Pagination = colonne à part entière** (`produits.pagination`), jamais
  seulement dans le texte du nom : "Cahier 100 pages" et "Cahier 48 pages"
  restent deux références strictement distinctes, filtrables et recherchables
  par nombre de pages.
- **Historique** (`mouvements_stock`) : chaque entrée, sortie ou vente écrit
  une ligne immuable avec le solde après mouvement — c'est la source de vérité
  utilisée par la fiche produit et l'onglet Historique.
- **Facture** : une vente crée une facture numérotée (`FAC-2026-0001`, etc.),
  diminue le stock ligne par ligne, et peut être imprimée/exportée en PDF
  directement depuis le navigateur (bouton "Imprimer / PDF").

## Structure de la base de données

```
categories → produits → { entrees, sorties, details_vente } → mouvements_stock
fournisseurs → entrees
clients → { sorties, ventes }
ventes → details_vente
utilisateurs → (tous les mouvements, pour la traçabilité)
```

## Étendre le logiciel (stylos, livres, rames, fournitures…)

Aucune structure à changer : crée simplement une nouvelle catégorie
(ex. "Fournitures scolaires") puis ajoute les produits avec leur propre
conditionnement (`piece_par_paquet` / `paquet_par_carton` peuvent être
différents pour chaque produit — une rame de papier n'a pas le même
conditionnement qu'un cahier).

## Prochaines améliorations possibles

- Retours produits et remises sur facture
- Paiements partiels / crédit client
- Export Excel des rapports
- Notifications automatiques (WhatsApp/SMS) sur seuil de stock atteint

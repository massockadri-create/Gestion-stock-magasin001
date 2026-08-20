// db.js — Connexion SQLite + schéma complet de la base de données
// Base de données : produits -> categories -> fournisseurs -> entrees -> sorties
//                    -> ventes -> details_vente -> mouvements_stock -> utilisateurs

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'gestion.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nom TEXT NOT NULL UNIQUE,
  description TEXT
);

CREATE TABLE IF NOT EXISTS fournisseurs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nom TEXT NOT NULL,
  contact TEXT,
  adresse TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS clients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nom TEXT NOT NULL,
  contact TEXT,
  adresse TEXT,
  type_client TEXT DEFAULT 'particulier', -- particulier / commerce / librairie
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS utilisateurs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nom TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'magasinier', -- admin / magasinier / caissier
  actif INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

-- PRODUITS : la pagination, le format, la marque, le type sont des colonnes dédiées
-- (jamais seulement dans le nom) afin que 48p / 96p / 100p / 192p restent des
-- références strictement distinctes, même avec la même désignation.
CREATE TABLE IF NOT EXISTS produits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reference TEXT NOT NULL UNIQUE,
  designation TEXT NOT NULL,
  categorie_id INTEGER REFERENCES categories(id),
  pagination INTEGER,              -- nombre de pages (ex: 48, 96, 100, 120, 192)
  format TEXT,                     -- ex: 17x22
  marque TEXT,                     -- ex: Clairefontaine
  type_produit TEXT,               -- ex: Seyès, Grands carreaux, Uni
  couverture TEXT,                 -- ex: Cartonnée, Souple
  piece_par_paquet INTEGER NOT NULL DEFAULT 1,
  paquet_par_carton INTEGER NOT NULL DEFAULT 1,
  stock_initial INTEGER NOT NULL DEFAULT 0,   -- en pièces
  stock_pieces INTEGER NOT NULL DEFAULT 0,    -- stock actuel en pièces (compteur maintenu à jour)
  prix_achat INTEGER NOT NULL DEFAULT 0,      -- FCFA
  prix_vente INTEGER NOT NULL DEFAULT 0,      -- FCFA
  seuil_minimum INTEGER NOT NULL DEFAULT 0,   -- en pièces
  actif INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS entrees (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL DEFAULT (datetime('now')),
  fournisseur_id INTEGER REFERENCES fournisseurs(id),
  numero_bon TEXT,
  produit_id INTEGER NOT NULL REFERENCES produits(id),
  qte_carton INTEGER NOT NULL DEFAULT 0,
  qte_paquet INTEGER NOT NULL DEFAULT 0,
  qte_piece INTEGER NOT NULL DEFAULT 0,
  qte_totale_pieces INTEGER NOT NULL,
  prix_achat_unitaire INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL DEFAULT 0,
  utilisateur_id INTEGER REFERENCES utilisateurs(id),
  note TEXT
);

CREATE TABLE IF NOT EXISTS sorties (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL DEFAULT (datetime('now')),
  type_sortie TEXT NOT NULL DEFAULT 'autre', -- client / commerce / librairie / autre
  client_id INTEGER REFERENCES clients(id),
  produit_id INTEGER NOT NULL REFERENCES produits(id),
  qte_carton INTEGER NOT NULL DEFAULT 0,
  qte_paquet INTEGER NOT NULL DEFAULT 0,
  qte_piece INTEGER NOT NULL DEFAULT 0,
  qte_totale_pieces INTEGER NOT NULL,
  utilisateur_id INTEGER REFERENCES utilisateurs(id),
  note TEXT
);

CREATE TABLE IF NOT EXISTS ventes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL DEFAULT (datetime('now')),
  client_id INTEGER REFERENCES clients(id),
  utilisateur_id INTEGER REFERENCES utilisateurs(id),
  total INTEGER NOT NULL DEFAULT 0,
  mode_paiement TEXT DEFAULT 'especes', -- especes / orange_money / mtn_momo / autre
  statut TEXT DEFAULT 'validee', -- validee / annulee
  numero_facture TEXT UNIQUE
);

CREATE TABLE IF NOT EXISTS details_vente (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vente_id INTEGER NOT NULL REFERENCES ventes(id),
  produit_id INTEGER NOT NULL REFERENCES produits(id),
  qte_pieces INTEGER NOT NULL,
  prix_unitaire INTEGER NOT NULL,
  sous_total INTEGER NOT NULL
);

-- Journal complet de tous les mouvements (source de vérité pour l'historique / fiche produit)
CREATE TABLE IF NOT EXISTS mouvements_stock (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL DEFAULT (datetime('now')),
  produit_id INTEGER NOT NULL REFERENCES produits(id),
  type_mouvement TEXT NOT NULL, -- entree / sortie_client / sortie_commerce / sortie_librairie / sortie_autre / vente / ajustement
  quantite INTEGER NOT NULL,    -- positif = entrée, négatif = sortie
  stock_apres INTEGER NOT NULL,
  reference_type TEXT,          -- entree / sortie / vente
  reference_id INTEGER,
  utilisateur_id INTEGER REFERENCES utilisateurs(id),
  note TEXT
);

CREATE INDEX IF NOT EXISTS idx_produits_pagination ON produits(pagination);
CREATE INDEX IF NOT EXISTS idx_produits_marque ON produits(marque);
CREATE INDEX IF NOT EXISTS idx_mouvements_produit ON mouvements_stock(produit_id);
CREATE INDEX IF NOT EXISTS idx_entrees_produit ON entrees(produit_id);
CREATE INDEX IF NOT EXISTS idx_sorties_produit ON sorties(produit_id);
`);

module.exports = db;

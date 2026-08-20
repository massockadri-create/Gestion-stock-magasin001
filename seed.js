// node seed.js — crée le compte administrateur et quelques données de démonstration
const bcrypt = require('bcryptjs');
const db = require('./db');

const adminEmail = process.env.ADMIN_EMAIL || 'admin@librairie.cm';
const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';

const existing = db.prepare('SELECT id FROM utilisateurs WHERE email = ?').get(adminEmail);
if (!existing) {
  const hash = bcrypt.hashSync(adminPassword, 10);
  db.prepare('INSERT INTO utilisateurs (nom, email, password_hash, role) VALUES (?, ?, ?, ?)')
    .run('Administrateur', adminEmail, hash, 'admin');
  console.log(`✅ Compte admin créé : ${adminEmail} / ${adminPassword}`);
} else {
  console.log('ℹ️  Le compte admin existe déjà.');
}

const catExiste = db.prepare('SELECT id FROM categories WHERE nom = ?').get('Cahiers');
const catId = catExiste ? catExiste.id : db.prepare('INSERT INTO categories (nom, description) VALUES (?, ?)')
  .run('Cahiers', 'Cahiers scolaires et de bureau').lastInsertRowid;

const nbProduits = db.prepare('SELECT COUNT(*) AS n FROM produits').get().n;
if (nbProduits === 0) {
  const produitsDemo = [
    ['CAH-048', 'Cahier 48 pages', 48, '17x22', 'Clairefontaine', 'Seyès', 'Souple', 200, 350, 400, 30],
    ['CAH-096', 'Cahier 96 pages', 96, '17x22', 'Clairefontaine', 'Seyès', 'Cartonnée', 300, 500, 600, 50],
    ['CAH-100', 'Cahier 100 pages', 100, '21x29.7', 'Clairefontaine', 'Seyès', 'Cartonnée', 500, 350, 500, 50],
    ['CAH-120', 'Cahier 120 pages', 120, '21x29.7', 'Africa Print', 'Grands carreaux', 'Cartonnée', 150, 600, 750, 40],
    ['CAH-192', 'Cahier 192 pages', 192, '21x29.7', 'Clairefontaine', 'Seyès', 'Cartonnée', 100, 900, 1100, 20],
  ];
  const insert = db.prepare(`
    INSERT INTO produits (reference, designation, categorie_id, pagination, format, marque, type_produit, couverture,
      piece_par_paquet, paquet_par_carton, stock_initial, stock_pieces, prix_achat, prix_vente, seuil_minimum)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 10, 10, ?, ?, ?, ?, ?)
  `);
  for (const [ref, des, pag, fmt, marque, type, couv, stock, achat, vente, seuil] of produitsDemo) {
    insert.run(ref, des, catId, pag, fmt, marque, type, couv, stock, stock, achat, vente, seuil);
  }
  console.log('✅ Produits de démonstration ajoutés (5 cahiers, pagination 48 à 192 pages).');
}

console.log('Initialisation terminée.');

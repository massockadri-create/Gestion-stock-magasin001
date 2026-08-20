const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { totalPieces } = require('../utils');

const router = express.Router();
router.use(requireAuth, requireRole('admin', 'magasinier'));

router.get('/', (req, res) => {
  const rows = db.prepare(`
    SELECT e.*, p.reference, p.designation, f.nom AS fournisseur_nom, u.nom AS utilisateur_nom
    FROM entrees e
    JOIN produits p ON p.id = e.produit_id
    LEFT JOIN fournisseurs f ON f.id = e.fournisseur_id
    LEFT JOIN utilisateurs u ON u.id = e.utilisateur_id
    ORDER BY e.date DESC, e.id DESC LIMIT 500
  `).all();
  res.json(rows);
});

router.post('/', (req, res) => {
  const {
    fournisseur_id, numero_bon, produit_id,
    qte_carton = 0, qte_paquet = 0, qte_piece = 0,
    prix_achat_unitaire, note
  } = req.body;

  const produit = db.prepare('SELECT * FROM produits WHERE id = ?').get(produit_id);
  if (!produit) return res.status(404).json({ error: 'Produit introuvable' });

  const qteTotale = totalPieces(produit, qte_carton, qte_paquet, qte_piece);
  if (qteTotale <= 0) return res.status(400).json({ error: 'La quantité totale doit être supérieure à zéro' });

  const prixUnitaire = (prix_achat_unitaire === undefined || prix_achat_unitaire === null || prix_achat_unitaire === '')
    ? produit.prix_achat
    : Number(prix_achat_unitaire);
  const total = qteTotale * prixUnitaire;

  const tx = db.transaction(() => {
    const info = db.prepare(`
      INSERT INTO entrees (fournisseur_id, numero_bon, produit_id, qte_carton, qte_paquet, qte_piece, qte_totale_pieces, prix_achat_unitaire, total, utilisateur_id, note)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(fournisseur_id || null, numero_bon || null, produit_id, qte_carton, qte_paquet, qte_piece, qteTotale, prixUnitaire, total, req.user.id, note || null);

    const nouveauStock = produit.stock_pieces + qteTotale;
    db.prepare(`UPDATE produits SET stock_pieces = ?, updated_at = datetime('now') WHERE id = ?`).run(nouveauStock, produit_id);

    db.prepare(`
      INSERT INTO mouvements_stock (produit_id, type_mouvement, quantite, stock_apres, reference_type, reference_id, utilisateur_id, note)
      VALUES (?, 'entree', ?, ?, 'entree', ?, ?, ?)
    `).run(produit_id, qteTotale, nouveauStock, info.lastInsertRowid, req.user.id, note || null);

    return { id: info.lastInsertRowid, qteTotale, nouveauStock };
  });

  const result = tx();
  res.status(201).json(result);
});

module.exports = router;

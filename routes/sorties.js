const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { totalPieces } = require('../utils');

const router = express.Router();
router.use(requireAuth, requireRole('admin', 'magasinier'));

router.get('/', (req, res) => {
  const { type_sortie } = req.query;
  let sql = `
    SELECT s.*, p.reference, p.designation, c.nom AS client_nom, u.nom AS utilisateur_nom
    FROM sorties s
    JOIN produits p ON p.id = s.produit_id
    LEFT JOIN clients c ON c.id = s.client_id
    LEFT JOIN utilisateurs u ON u.id = s.utilisateur_id
  `;
  const params = [];
  if (type_sortie) { sql += ' WHERE s.type_sortie = ?'; params.push(type_sortie); }
  sql += ' ORDER BY s.date DESC, s.id DESC LIMIT 500';
  res.json(db.prepare(sql).all(...params));
});

router.post('/', (req, res) => {
  const {
    type_sortie = 'autre', client_id, produit_id,
    qte_carton = 0, qte_paquet = 0, qte_piece = 0, note
  } = req.body;

  if (!['client', 'commerce', 'librairie', 'autre'].includes(type_sortie)) {
    return res.status(400).json({ error: 'Type de sortie invalide' });
  }

  const produit = db.prepare('SELECT * FROM produits WHERE id = ?').get(produit_id);
  if (!produit) return res.status(404).json({ error: 'Produit introuvable' });

  const qteTotale = totalPieces(produit, qte_carton, qte_paquet, qte_piece);
  if (qteTotale <= 0) return res.status(400).json({ error: 'La quantité totale doit être supérieure à zéro' });
  if (qteTotale > produit.stock_pieces) {
    return res.status(400).json({ error: `Stock insuffisant : disponible ${produit.stock_pieces} pièce(s)` });
  }

  const tx = db.transaction(() => {
    const info = db.prepare(`
      INSERT INTO sorties (type_sortie, client_id, produit_id, qte_carton, qte_paquet, qte_piece, qte_totale_pieces, utilisateur_id, note)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(type_sortie, client_id || null, produit_id, qte_carton, qte_paquet, qte_piece, qteTotale, req.user.id, note || null);

    const nouveauStock = produit.stock_pieces - qteTotale;
    db.prepare(`UPDATE produits SET stock_pieces = ?, updated_at = datetime('now') WHERE id = ?`).run(nouveauStock, produit_id);

    db.prepare(`
      INSERT INTO mouvements_stock (produit_id, type_mouvement, quantite, stock_apres, reference_type, reference_id, utilisateur_id, note)
      VALUES (?, ?, ?, ?, 'sortie', ?, ?, ?)
    `).run(produit_id, `sortie_${type_sortie}`, -qteTotale, nouveauStock, info.lastInsertRowid, req.user.id, note || null);

    return { id: info.lastInsertRowid, qteTotale, nouveauStock };
  });

  res.status(201).json(tx());
});

module.exports = router;

const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

router.get('/', (req, res) => {
  const { produit_id, type_mouvement, date_debut, date_fin } = req.query;
  let sql = `
    SELECT m.*, p.reference, p.designation, u.nom AS utilisateur_nom
    FROM mouvements_stock m
    JOIN produits p ON p.id = m.produit_id
    LEFT JOIN utilisateurs u ON u.id = m.utilisateur_id
    WHERE 1=1
  `;
  const params = [];
  if (produit_id) { sql += ' AND m.produit_id = ?'; params.push(produit_id); }
  if (type_mouvement) { sql += ' AND m.type_mouvement = ?'; params.push(type_mouvement); }
  if (date_debut) { sql += ' AND date(m.date) >= date(?)'; params.push(date_debut); }
  if (date_fin) { sql += ' AND date(m.date) <= date(?)'; params.push(date_fin); }
  sql += ' ORDER BY m.date DESC, m.id DESC LIMIT 1000';

  res.json(db.prepare(sql).all(...params));
});

module.exports = router;

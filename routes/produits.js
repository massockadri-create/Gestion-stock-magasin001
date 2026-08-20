const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { decompose, statutStock } = require('../utils');

const router = express.Router();
router.use(requireAuth);

function enrichir(p) {
  return {
    ...p,
    statut: statutStock(p),
    stock_decompose: decompose(p, p.stock_pieces),
    valeur_stock: p.stock_pieces * p.prix_achat
  };
}

// Liste + recherche intelligente : ?q=100 pages | Clairefontaine | CAH-001 | 96 pages Seyès
router.get('/', (req, res) => {
  const { q, categorie_id, statut } = req.query;
  let produits = db.prepare(`
    SELECT p.*, c.nom AS categorie_nom FROM produits p
    LEFT JOIN categories c ON c.id = p.categorie_id
    WHERE p.actif = 1
    ORDER BY p.designation
  `).all();

  if (q && q.trim()) {
    const termes = q.toLowerCase().trim().split(/\s+/);
    produits = produits.filter(p => {
      const texte = [
        p.reference, p.designation, p.marque, p.type_produit, p.format,
        p.couverture, p.categorie_nom, p.pagination ? `${p.pagination} pages` : ''
      ].join(' ').toLowerCase();
      return termes.every(t => texte.includes(t));
    });
  }
  if (categorie_id) produits = produits.filter(p => String(p.categorie_id) === String(categorie_id));

  produits = produits.map(enrichir);
  if (statut) produits = produits.filter(p => p.statut === statut);

  res.json(produits);
});

// Alertes de stock (faible / épuisé)
router.get('/alertes', (req, res) => {
  const produits = db.prepare('SELECT * FROM produits WHERE actif = 1').all().map(enrichir);
  res.json(produits.filter(p => p.statut !== 'normal').sort((a, b) => a.stock_pieces - b.stock_pieces));
});

// Fiche produit détaillée + historique complet
router.get('/:id', (req, res) => {
  const p = db.prepare('SELECT * FROM produits WHERE id = ?').get(req.params.id);
  if (!p) return res.status(404).json({ error: 'Produit introuvable' });

  const entrees = db.prepare('SELECT COALESCE(SUM(qte_totale_pieces),0) AS t FROM entrees WHERE produit_id = ?').get(p.id).t;
  const sorties = db.prepare('SELECT COALESCE(SUM(qte_totale_pieces),0) AS t FROM sorties WHERE produit_id = ?').get(p.id).t;
  const ventes = db.prepare('SELECT COALESCE(SUM(qte_pieces),0) AS t FROM details_vente dv JOIN ventes v ON v.id=dv.vente_id WHERE dv.produit_id = ? AND v.statut = "validee"').get(p.id).t;
  const derniereSortie = db.prepare(`
    SELECT date FROM mouvements_stock WHERE produit_id = ? AND quantite < 0 ORDER BY date DESC LIMIT 1
  `).get(p.id);

  const historique = db.prepare(`
    SELECT m.*, u.nom AS utilisateur_nom FROM mouvements_stock m
    LEFT JOIN utilisateurs u ON u.id = m.utilisateur_id
    WHERE m.produit_id = ? ORDER BY m.date DESC, m.id DESC LIMIT 200
  `).all(p.id);

  res.json({
    ...enrichir(p),
    total_entrees: entrees,
    total_sorties: sorties + ventes,
    derniere_sortie: derniereSortie ? derniereSortie.date : null,
    historique
  });
});

router.post('/', requireRole('admin', 'magasinier'), (req, res) => {
  const {
    reference, designation, categorie_id, pagination, format, marque, type_produit,
    couverture, piece_par_paquet, paquet_par_carton, stock_initial,
    prix_achat, prix_vente, seuil_minimum
  } = req.body;

  if (!reference || !designation) return res.status(400).json({ error: 'Référence et désignation requises' });

  try {
    const info = db.prepare(`
      INSERT INTO produits
        (reference, designation, categorie_id, pagination, format, marque, type_produit, couverture,
         piece_par_paquet, paquet_par_carton, stock_initial, stock_pieces, prix_achat, prix_vente, seuil_minimum)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      reference, designation, categorie_id || null, pagination || null, format || null,
      marque || null, type_produit || null, couverture || null,
      piece_par_paquet || 1, paquet_par_carton || 1,
      stock_initial || 0, stock_initial || 0,
      prix_achat || 0, prix_vente || 0, seuil_minimum || 0
    );

    if (stock_initial > 0) {
      db.prepare(`
        INSERT INTO mouvements_stock (produit_id, type_mouvement, quantite, stock_apres, reference_type, utilisateur_id, note)
        VALUES (?, 'ajustement', ?, ?, 'initial', ?, 'Stock initial')
      `).run(info.lastInsertRowid, stock_initial, stock_initial, req.user.id);
    }

    res.status(201).json({ id: info.lastInsertRowid });
  } catch (e) {
    res.status(400).json({ error: 'Référence déjà existante' });
  }
});

router.put('/:id', requireRole('admin', 'magasinier'), (req, res) => {
  const existing = db.prepare('SELECT * FROM produits WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Produit introuvable' });

  const fields = [
    'designation', 'categorie_id', 'pagination', 'format', 'marque', 'type_produit',
    'couverture', 'piece_par_paquet', 'paquet_par_carton', 'prix_achat', 'prix_vente', 'seuil_minimum'
  ];
  const updates = {};
  fields.forEach(f => { if (req.body[f] !== undefined) updates[f] = req.body[f]; });

  const setClause = Object.keys(updates).map(k => `${k} = ?`).join(', ');
  if (setClause) {
    db.prepare(`UPDATE produits SET ${setClause}, updated_at = datetime('now') WHERE id = ?`)
      .run(...Object.values(updates), req.params.id);
  }
  res.json({ ok: true });
});

router.delete('/:id', requireRole('admin'), (req, res) => {
  db.prepare('UPDATE produits SET actif = 0 WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;

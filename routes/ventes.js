const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { genererNumeroFacture } = require('../utils');

const router = express.Router();
router.use(requireAuth, requireRole('admin', 'caissier'));

router.get('/', (req, res) => {
  const rows = db.prepare(`
    SELECT v.*, c.nom AS client_nom, u.nom AS utilisateur_nom
    FROM ventes v
    LEFT JOIN clients c ON c.id = v.client_id
    LEFT JOIN utilisateurs u ON u.id = v.utilisateur_id
    ORDER BY v.date DESC, v.id DESC LIMIT 500
  `).all();
  res.json(rows);
});

// Détail d'une vente = la facture, prête à imprimer
router.get('/:id', (req, res) => {
  const vente = db.prepare(`
    SELECT v.*, c.nom AS client_nom, c.contact AS client_contact, u.nom AS utilisateur_nom
    FROM ventes v
    LEFT JOIN clients c ON c.id = v.client_id
    LEFT JOIN utilisateurs u ON u.id = v.utilisateur_id
    WHERE v.id = ?
  `).get(req.params.id);
  if (!vente) return res.status(404).json({ error: 'Vente introuvable' });

  const lignes = db.prepare(`
    SELECT dv.*, p.reference, p.designation, p.pagination
    FROM details_vente dv JOIN produits p ON p.id = dv.produit_id
    WHERE dv.vente_id = ?
  `).all(vente.id);

  res.json({ ...vente, lignes });
});

// Body attendu : { client_id, mode_paiement, lignes: [{ produit_id, qte_pieces, prix_unitaire? }] }
router.post('/', (req, res) => {
  const { client_id, mode_paiement = 'especes', lignes } = req.body;
  if (!Array.isArray(lignes) || lignes.length === 0) {
    return res.status(400).json({ error: 'Au moins une ligne de vente est requise' });
  }

  const tx = db.transaction(() => {
    // Vérification du stock pour toutes les lignes avant tout mouvement
    const produitsById = {};
    for (const ligne of lignes) {
      const produit = db.prepare('SELECT * FROM produits WHERE id = ?').get(ligne.produit_id);
      if (!produit) throw { status: 404, message: `Produit ${ligne.produit_id} introuvable` };
      if (ligne.qte_pieces <= 0) throw { status: 400, message: 'Quantité invalide' };
      if (ligne.qte_pieces > produit.stock_pieces) {
        throw { status: 400, message: `Stock insuffisant pour ${produit.designation} (disponible: ${produit.stock_pieces})` };
      }
      produitsById[ligne.produit_id] = produit;
    }

    const total = lignes.reduce((sum, l) => {
      const prix = l.prix_unitaire ?? produitsById[l.produit_id].prix_vente;
      return sum + prix * l.qte_pieces;
    }, 0);

    const numeroFacture = genererNumeroFacture(db);
    const venteInfo = db.prepare(`
      INSERT INTO ventes (client_id, utilisateur_id, total, mode_paiement, statut, numero_facture)
      VALUES (?, ?, ?, ?, 'validee', ?)
    `).run(client_id || null, req.user.id, total, mode_paiement, numeroFacture);

    for (const ligne of lignes) {
      const produit = produitsById[ligne.produit_id];
      const prixUnitaire = ligne.prix_unitaire ?? produit.prix_vente;
      const sousTotal = prixUnitaire * ligne.qte_pieces;

      db.prepare(`
        INSERT INTO details_vente (vente_id, produit_id, qte_pieces, prix_unitaire, sous_total)
        VALUES (?, ?, ?, ?, ?)
      `).run(venteInfo.lastInsertRowid, produit.id, ligne.qte_pieces, prixUnitaire, sousTotal);

      const nouveauStock = produit.stock_pieces - ligne.qte_pieces;
      db.prepare(`UPDATE produits SET stock_pieces = ?, updated_at = datetime('now') WHERE id = ?`).run(nouveauStock, produit.id);

      db.prepare(`
        INSERT INTO mouvements_stock (produit_id, type_mouvement, quantite, stock_apres, reference_type, reference_id, utilisateur_id, note)
        VALUES (?, 'vente', ?, ?, 'vente', ?, ?, ?)
      `).run(produit.id, -ligne.qte_pieces, nouveauStock, venteInfo.lastInsertRowid, req.user.id, `Facture ${numeroFacture}`);
    }

    return { id: venteInfo.lastInsertRowid, numero_facture: numeroFacture, total };
  });

  try {
    res.status(201).json(tx());
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message || 'Erreur lors de la vente' });
  }
});

// Annulation d'une vente : remet le stock (traçable dans l'historique)
router.post('/:id/annuler', requireRole('admin'), (req, res) => {
  const vente = db.prepare('SELECT * FROM ventes WHERE id = ?').get(req.params.id);
  if (!vente) return res.status(404).json({ error: 'Vente introuvable' });
  if (vente.statut === 'annulee') return res.status(400).json({ error: 'Vente déjà annulée' });

  const tx = db.transaction(() => {
    const lignes = db.prepare('SELECT * FROM details_vente WHERE vente_id = ?').all(vente.id);
    for (const ligne of lignes) {
      const produit = db.prepare('SELECT * FROM produits WHERE id = ?').get(ligne.produit_id);
      const nouveauStock = produit.stock_pieces + ligne.qte_pieces;
      db.prepare(`UPDATE produits SET stock_pieces = ? WHERE id = ?`).run(nouveauStock, produit.id);
      db.prepare(`
        INSERT INTO mouvements_stock (produit_id, type_mouvement, quantite, stock_apres, reference_type, reference_id, utilisateur_id, note)
        VALUES (?, 'ajustement', ?, ?, 'vente', ?, ?, 'Annulation de vente')
      `).run(produit.id, ligne.qte_pieces, nouveauStock, vente.id, req.user.id);
    }
    db.prepare(`UPDATE ventes SET statut = 'annulee' WHERE id = ?`).run(vente.id);
  });

  tx();
  res.json({ ok: true });
});

module.exports = router;

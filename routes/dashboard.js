const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { statutStock } = require('../utils');

const router = express.Router();
router.use(requireAuth);

router.get('/', (req, res) => {
  const produits = db.prepare('SELECT * FROM produits WHERE actif = 1').all();

  const totalCahiers = produits.reduce((s, p) => s + p.stock_pieces, 0);
  const valeurStock = produits.reduce((s, p) => s + p.stock_pieces * p.prix_achat, 0);
  const nbReferences = produits.length;
  const alertes = produits.filter(p => statutStock(p) !== 'normal');

  const today = new Date().toISOString().slice(0, 10);

  const entreesAujourdhui = db.prepare(
    `SELECT COALESCE(SUM(qte_totale_pieces),0) AS t FROM entrees WHERE date(date) = date(?)`
  ).get(today).t;

  const sortiesAujourdhui = db.prepare(
    `SELECT COALESCE(SUM(qte_totale_pieces),0) AS t FROM sorties WHERE date(date) = date(?)`
  ).get(today).t;

  const ventesAujourdhui = db.prepare(
    `SELECT COALESCE(SUM(dv.qte_pieces),0) AS t FROM details_vente dv JOIN ventes v ON v.id=dv.vente_id WHERE date(v.date) = date(?) AND v.statut='validee'`
  ).get(today).t;

  const chiffreAffairesAujourdhui = db.prepare(
    `SELECT COALESCE(SUM(total),0) AS t FROM ventes WHERE date(date) = date(?) AND statut='validee'`
  ).get(today).t;

  const chiffreAffairesTotal = db.prepare(
    `SELECT COALESCE(SUM(total),0) AS t FROM ventes WHERE statut='validee'`
  ).get().t;

  // Marge = somme((prix_vente - prix_achat) * qte_pieces) sur toutes les ventes validées
  const marge = db.prepare(`
    SELECT COALESCE(SUM((dv.prix_unitaire - p.prix_achat) * dv.qte_pieces),0) AS t
    FROM details_vente dv
    JOIN ventes v ON v.id = dv.vente_id
    JOIN produits p ON p.id = dv.produit_id
    WHERE v.statut = 'validee'
  `).get().t;

  const produitsPlusVendus = db.prepare(`
    SELECT p.id, p.reference, p.designation, p.pagination, SUM(dv.qte_pieces) AS quantite_vendue
    FROM details_vente dv
    JOIN ventes v ON v.id = dv.vente_id
    JOIN produits p ON p.id = dv.produit_id
    WHERE v.statut = 'validee'
    GROUP BY p.id ORDER BY quantite_vendue DESC LIMIT 10
  `).all();

  res.json({
    total_cahiers_stock: totalCahiers,
    valeur_totale_stock: valeurStock,
    nombre_references: nbReferences,
    entrees_aujourdhui: entreesAujourdhui,
    sorties_aujourdhui: sortiesAujourdhui + ventesAujourdhui,
    chiffre_affaires_aujourdhui: chiffreAffairesAujourdhui,
    chiffre_affaires_total: chiffreAffairesTotal,
    marge_beneficiaire_totale: marge,
    nombre_alertes: alertes.length,
    alertes: alertes.slice(0, 10),
    produits_plus_vendus: produitsPlusVendus
  });
});

module.exports = router;

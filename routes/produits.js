const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { decompose, statutStock, parseCSV, toCSV } = require('../utils');

const router = express.Router();
router.use(requireAuth);

const TYPES_CONDITIONNEMENT = ['cahier', 'accessoire', 'livre'];

function enrichir(p) {
  return {
    ...p,
    statut: statutStock(p),
    stock_decompose: decompose(p, p.stock_pieces),
    valeur_stock: p.stock_pieces * p.prix_achat
  };
}

// Normalise les champs de conditionnement reçus (form ou CSV) en fonction du type
function champsConditionnement(body) {
  const type = TYPES_CONDITIONNEMENT.includes(body.type_conditionnement) ? body.type_conditionnement : 'cahier';
  const out = { type_conditionnement: type };
  if (type === 'cahier') {
    out.piece_par_paquet = Number(body.piece_par_paquet) || 1;
    out.paquet_par_carton = Number(body.paquet_par_carton) || 1;
    out.paquet_par_box = null; out.box_par_carton = null; out.piece_par_carton = null;
  } else if (type === 'accessoire') {
    out.piece_par_paquet = Number(body.piece_par_paquet) || 1;
    out.paquet_par_box = Number(body.paquet_par_box) || 1;
    out.box_par_carton = Number(body.box_par_carton) || 1;
    out.paquet_par_carton = null; out.piece_par_carton = null;
  } else { // livre
    out.piece_par_carton = Number(body.piece_par_carton) || 1;
    out.piece_par_paquet = null; out.paquet_par_carton = null;
    out.paquet_par_box = null; out.box_par_carton = null;
  }
  return out;
}

// Liste + recherche intelligente : ?q=100 pages | Clairefontaine | CAH-001 | 96 pages Seyès
router.get('/', (req, res) => {
  const { q, categorie_id, statut, type_conditionnement } = req.query;
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
  if (type_conditionnement) produits = produits.filter(p => p.type_conditionnement === type_conditionnement);

  produits = produits.map(enrichir);
  if (statut) produits = produits.filter(p => p.statut === statut);

  res.json(produits);
});

// Alertes de stock (faible / épuisé)
router.get('/alertes', (req, res) => {
  const produits = db.prepare('SELECT * FROM produits WHERE actif = 1').all().map(enrichir);
  res.json(produits.filter(p => p.statut !== 'normal').sort((a, b) => a.stock_pieces - b.stock_pieces));
});

// -------------------- EXPORT CSV --------------------
router.get('/export/csv', (req, res) => {
  const produits = db.prepare(`
    SELECT p.*, c.nom AS categorie_nom FROM produits p
    LEFT JOIN categories c ON c.id = p.categorie_id
    WHERE p.actif = 1 ORDER BY p.reference
  `).all();

  const headers = [
    'reference', 'designation', 'categorie', 'type_conditionnement', 'pagination', 'format',
    'marque', 'type_produit', 'couverture', 'piece_par_paquet', 'paquet_par_box', 'box_par_carton',
    'paquet_par_carton', 'piece_par_carton', 'stock_actuel_pieces', 'prix_achat', 'prix_vente', 'seuil_minimum'
  ];
  const rows = produits.map(p => [
    p.reference, p.designation, p.categorie_nom || '', p.type_conditionnement,
    p.pagination ?? '', p.format ?? '', p.marque ?? '', p.type_produit ?? '', p.couverture ?? '',
    p.piece_par_paquet ?? '', p.paquet_par_box ?? '', p.box_par_carton ?? '',
    p.paquet_par_carton ?? '', p.piece_par_carton ?? '',
    p.stock_pieces, p.prix_achat, p.prix_vente, p.seuil_minimum
  ]);

  const csv = '\uFEFF' + toCSV(headers, rows); // BOM pour un bon affichage des accents dans Excel
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="produits-${new Date().toISOString().slice(0,10)}.csv"`);
  res.send(csv);
});

// -------------------- IMPORT CSV --------------------
// Body attendu : { csv: "texte du fichier csv" }
// Colonnes reconnues (même ordre que l'export) ; 'reference' est la clé de correspondance :
// si elle existe déjà -> mise à jour des infos produit (le stock n'est PAS touché) ;
// sinon -> création avec stock_initial = stock_actuel_pieces fourni.
router.post('/import/csv', requireRole('admin', 'magasinier'), (req, res) => {
  const { csv } = req.body;
  if (!csv || typeof csv !== 'string') return res.status(400).json({ error: 'Contenu CSV manquant' });

  const rows = parseCSV(csv.replace(/^\uFEFF/, ''));
  if (rows.length < 2) return res.status(400).json({ error: 'Le fichier CSV ne contient aucune ligne de données' });

  const header = rows[0].map(h => h.trim().toLowerCase());
  const idx = name => header.indexOf(name);

  const iRef = idx('reference'), iDes = idx('designation');
  if (iRef === -1 || iDes === -1) {
    return res.status(400).json({ error: "Colonnes 'reference' et 'designation' obligatoires dans l'en-tête" });
  }

  const getCategorieId = (() => {
    const cache = {};
    return nom => {
      if (!nom) return null;
      if (cache[nom]) return cache[nom];
      let cat = db.prepare('SELECT id FROM categories WHERE nom = ?').get(nom);
      if (!cat) { const info = db.prepare('INSERT INTO categories (nom) VALUES (?)').run(nom); cat = { id: info.lastInsertRowid }; }
      cache[nom] = cat.id;
      return cat.id;
    };
  })();

  let crees = 0, mis_a_jour = 0;
  const erreurs = [];

  const tx = db.transaction(() => {
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      const get = name => { const j = idx(name); return j === -1 ? '' : (r[j] ?? '').trim(); };

      const reference = get('reference');
      const designation = get('designation');
      if (!reference || !designation) { erreurs.push(`Ligne ${i + 1} : référence ou désignation manquante`); continue; }

      const cond = champsConditionnement({
        type_conditionnement: get('type_conditionnement'),
        piece_par_paquet: get('piece_par_paquet'),
        paquet_par_box: get('paquet_par_box'),
        box_par_carton: get('box_par_carton'),
        paquet_par_carton: get('paquet_par_carton'),
        piece_par_carton: get('piece_par_carton'),
      });

      const categorie_id = getCategorieId(get('categorie'));
      const pagination = get('pagination') ? Number(get('pagination')) : null;
      const format = get('format') || null;
      const marque = get('marque') || null;
      const type_produit = get('type_produit') || null;
      const couverture = get('couverture') || null;
      const prix_achat = Number(get('prix_achat')) || 0;
      const prix_vente = Number(get('prix_vente')) || 0;
      const seuil_minimum = Number(get('seuil_minimum')) || 0;
      const stockCsv = get('stock_actuel_pieces');

      const existant = db.prepare('SELECT id FROM produits WHERE reference = ?').get(reference);

      if (existant) {
        db.prepare(`
          UPDATE produits SET designation=?, categorie_id=?, pagination=?, format=?, marque=?, type_produit=?, couverture=?,
            type_conditionnement=?, piece_par_paquet=?, paquet_par_box=?, box_par_carton=?, paquet_par_carton=?, piece_par_carton=?,
            prix_achat=?, prix_vente=?, seuil_minimum=?, updated_at=datetime('now')
          WHERE id=?
        `).run(designation, categorie_id, pagination, format, marque, type_produit, couverture,
          cond.type_conditionnement, cond.piece_par_paquet, cond.paquet_par_box, cond.box_par_carton, cond.paquet_par_carton, cond.piece_par_carton,
          prix_achat, prix_vente, seuil_minimum, existant.id);
        mis_a_jour++;
      } else {
        const stockInitial = stockCsv ? Number(stockCsv) || 0 : 0;
        try {
          const info = db.prepare(`
            INSERT INTO produits (reference, designation, categorie_id, pagination, format, marque, type_produit, couverture,
              type_conditionnement, piece_par_paquet, paquet_par_box, box_par_carton, paquet_par_carton, piece_par_carton,
              stock_initial, stock_pieces, prix_achat, prix_vente, seuil_minimum)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(reference, designation, categorie_id, pagination, format, marque, type_produit, couverture,
            cond.type_conditionnement, cond.piece_par_paquet, cond.paquet_par_box, cond.box_par_carton, cond.paquet_par_carton, cond.piece_par_carton,
            stockInitial, stockInitial, prix_achat, prix_vente, seuil_minimum);
          if (stockInitial > 0) {
            db.prepare(`
              INSERT INTO mouvements_stock (produit_id, type_mouvement, quantite, stock_apres, reference_type, utilisateur_id, note)
              VALUES (?, 'ajustement', ?, ?, 'import', ?, 'Import CSV')
            `).run(info.lastInsertRowid, stockInitial, stockInitial, req.user.id);
          }
          crees++;
        } catch (e) {
          erreurs.push(`Ligne ${i + 1} (${reference}) : ${e.message}`);
        }
      }
    }
  });

  tx();
  res.json({ crees, mis_a_jour, erreurs });
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
    couverture, stock_initial, prix_achat, prix_vente, seuil_minimum
  } = req.body;

  if (!reference || !designation) return res.status(400).json({ error: 'Référence et désignation requises' });

  const cond = champsConditionnement(req.body);

  try {
    const info = db.prepare(`
      INSERT INTO produits
        (reference, designation, categorie_id, pagination, format, marque, type_produit, couverture,
         type_conditionnement, piece_par_paquet, paquet_par_box, box_par_carton, paquet_par_carton, piece_par_carton,
         stock_initial, stock_pieces, prix_achat, prix_vente, seuil_minimum)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      reference, designation, categorie_id || null, pagination || null, format || null,
      marque || null, type_produit || null, couverture || null,
      cond.type_conditionnement, cond.piece_par_paquet, cond.paquet_par_box, cond.box_par_carton, cond.paquet_par_carton, cond.piece_par_carton,
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

  const fields = ['designation', 'categorie_id', 'pagination', 'format', 'marque', 'type_produit', 'couverture', 'prix_achat', 'prix_vente', 'seuil_minimum'];
  const updates = {};
  fields.forEach(f => { if (req.body[f] !== undefined) updates[f] = req.body[f]; });

  if (req.body.type_conditionnement !== undefined) {
    const cond = champsConditionnement(req.body);
    Object.assign(updates, cond);
  }

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

const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const router = express.Router();
router.use(requireAuth);

router.get('/', (req, res) => {
  res.json(db.prepare('SELECT * FROM fournisseurs ORDER BY nom').all());
});

router.post('/', (req, res) => {
  const { nom, contact, adresse } = req.body;
  if (!nom) return res.status(400).json({ error: 'Le nom est requis' });
  const info = db.prepare('INSERT INTO fournisseurs (nom, contact, adresse) VALUES (?, ?, ?)').run(nom, contact || null, adresse || null);
  res.status(201).json({ id: info.lastInsertRowid });
});

router.put('/:id', (req, res) => {
  const { nom, contact, adresse } = req.body;
  db.prepare('UPDATE fournisseurs SET nom = ?, contact = ?, adresse = ? WHERE id = ?')
    .run(nom, contact || null, adresse || null, req.params.id);
  res.json({ ok: true });
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM fournisseurs WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;

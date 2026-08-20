const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const router = express.Router();
router.use(requireAuth);

router.get('/', (req, res) => {
  res.json(db.prepare('SELECT * FROM clients ORDER BY nom').all());
});

router.post('/', (req, res) => {
  const { nom, contact, adresse, type_client } = req.body;
  if (!nom) return res.status(400).json({ error: 'Le nom est requis' });
  const info = db.prepare(
    'INSERT INTO clients (nom, contact, adresse, type_client) VALUES (?, ?, ?, ?)'
  ).run(nom, contact || null, adresse || null, type_client || 'particulier');
  res.status(201).json({ id: info.lastInsertRowid });
});

router.put('/:id', (req, res) => {
  const { nom, contact, adresse, type_client } = req.body;
  db.prepare('UPDATE clients SET nom = ?, contact = ?, adresse = ?, type_client = ? WHERE id = ?')
    .run(nom, contact || null, adresse || null, type_client || 'particulier', req.params.id);
  res.json({ ok: true });
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM clients WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;

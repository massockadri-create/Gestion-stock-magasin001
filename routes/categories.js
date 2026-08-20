const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const router = express.Router();
router.use(requireAuth);

router.get('/', (req, res) => {
  res.json(db.prepare('SELECT * FROM categories ORDER BY nom').all());
});

router.post('/', (req, res) => {
  const { nom, description } = req.body;
  if (!nom) return res.status(400).json({ error: 'Le nom est requis' });
  try {
    const info = db.prepare('INSERT INTO categories (nom, description) VALUES (?, ?)').run(nom, description || null);
    res.status(201).json({ id: info.lastInsertRowid });
  } catch (e) {
    res.status(400).json({ error: 'Cette catégorie existe déjà' });
  }
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM categories WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;

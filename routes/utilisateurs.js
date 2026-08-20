const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth, requireRole()); // admin uniquement (requireRole() sans rôle = admin only)

router.get('/', (req, res) => {
  const users = db.prepare('SELECT id, nom, email, role, actif, created_at FROM utilisateurs ORDER BY nom').all();
  res.json(users);
});

router.post('/', (req, res) => {
  const { nom, email, password, role } = req.body;
  if (!nom || !email || !password || !role) return res.status(400).json({ error: 'Champs manquants' });
  if (!['admin', 'magasinier', 'caissier'].includes(role)) return res.status(400).json({ error: 'Rôle invalide' });
  try {
    const hash = bcrypt.hashSync(password, 10);
    const info = db.prepare(
      'INSERT INTO utilisateurs (nom, email, password_hash, role) VALUES (?, ?, ?, ?)'
    ).run(nom, email, hash, role);
    res.status(201).json({ id: info.lastInsertRowid });
  } catch (e) {
    res.status(400).json({ error: 'Email déjà utilisé' });
  }
});

router.put('/:id', (req, res) => {
  const { nom, role, actif, password } = req.body;
  const existing = db.prepare('SELECT * FROM utilisateurs WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Utilisateur introuvable' });

  db.prepare('UPDATE utilisateurs SET nom = ?, role = ?, actif = ? WHERE id = ?')
    .run(nom ?? existing.nom, role ?? existing.role, actif ?? existing.actif, req.params.id);

  if (password) {
    const hash = bcrypt.hashSync(password, 10);
    db.prepare('UPDATE utilisateurs SET password_hash = ? WHERE id = ?').run(hash, req.params.id);
  }
  res.json({ ok: true });
});

router.delete('/:id', (req, res) => {
  db.prepare('UPDATE utilisateurs SET actif = 0 WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { SECRET, requireAuth } = require('../middleware/auth');

const router = express.Router();

router.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email et mot de passe requis' });

  const user = db.prepare('SELECT * FROM utilisateurs WHERE email = ? AND actif = 1').get(email);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Identifiants incorrects' });
  }

  const token = jwt.sign(
    { id: user.id, nom: user.nom, email: user.email, role: user.role },
    SECRET,
    { expiresIn: '12h' }
  );
  res.json({ token, user: { id: user.id, nom: user.nom, email: user.email, role: user.role } });
});

router.get('/me', requireAuth, (req, res) => res.json(req.user));

module.exports = router;

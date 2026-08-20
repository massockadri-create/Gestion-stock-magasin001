const express = require('express');
const cors = require('cors');
const path = require('path');

require('./db'); // initialise le schéma au démarrage

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/auth', require('./routes/auth'));
app.use('/api/utilisateurs', require('./routes/utilisateurs'));
app.use('/api/categories', require('./routes/categories'));
app.use('/api/fournisseurs', require('./routes/fournisseurs'));
app.use('/api/clients', require('./routes/clients'));
app.use('/api/produits', require('./routes/produits'));
app.use('/api/entrees', require('./routes/entrees'));
app.use('/api/sorties', require('./routes/sorties'));
app.use('/api/ventes', require('./routes/ventes'));
app.use('/api/mouvements', require('./routes/mouvements'));
app.use('/api/dashboard', require('./routes/dashboard'));

app.get('/api/health', (req, res) => res.json({ ok: true, service: 'gestion-cahiers' }));

// Toute route inconnue non-API renvoie l'app (single page app)
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Gestion Cahiers en ligne sur le port ${PORT}`));

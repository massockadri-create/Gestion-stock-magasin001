// ---------------------------------------------------------------------------
// Conditionnement par type de produit :
//  - cahier     : carton -> paquet -> pièce
//  - accessoire : carton -> box -> paquet -> pièce
//  - livre      : carton -> pièce (direct, pas de niveau intermédiaire)
//
// unitLevels() renvoie la chaîne d'unités du plus grand au plus petit
// (hors "pièce" elle-même), chacune avec son nombre de pièces équivalentes.
// C'est la seule fonction qui connaît la règle de conditionnement ; tout le
// reste (conversion, décomposition, affichage) s'appuie dessus.
// ---------------------------------------------------------------------------
function unitLevels(produit) {
  const type = produit.type_conditionnement || 'cahier';
  const pp = Number(produit.piece_par_paquet) || 1;

  if (type === 'livre') {
    const piecesParCarton = Number(produit.piece_par_carton) || 1;
    return [{ key: 'carton', label: 'carton', pieces: piecesParCarton }];
  }

  if (type === 'accessoire') {
    const paquetParBox = Number(produit.paquet_par_box) || 1;
    const boxParCarton = Number(produit.box_par_carton) || 1;
    const piecesParPaquet = pp;
    const piecesParBox = paquetParBox * piecesParPaquet;
    const piecesParCarton = boxParCarton * piecesParBox;
    return [
      { key: 'carton', label: 'carton', pieces: piecesParCarton },
      { key: 'box', label: 'box', pieces: piecesParBox },
      { key: 'paquet', label: 'paquet', pieces: piecesParPaquet },
    ];
  }

  // 'cahier' (par défaut)
  const paquetParCarton = Number(produit.paquet_par_carton) || 1;
  const piecesParPaquet = pp;
  const piecesParCarton = paquetParCarton * piecesParPaquet;
  return [
    { key: 'carton', label: 'carton', pieces: piecesParCarton },
    { key: 'paquet', label: 'paquet', pieces: piecesParPaquet },
  ];
}

// Convertit des quantités { carton, box, paquet, piece } en un total de pièces,
// selon la chaîne d'unités du produit. Les niveaux non pertinents pour ce type
// de produit (ex. "box" pour un cahier) sont simplement ignorés.
function totalPieces(produit, qtys = {}) {
  const levels = unitLevels(produit);
  let total = Number(qtys.piece || 0);
  for (const lvl of levels) {
    const qte = Number(qtys[lvl.key] || 0);
    total += qte * lvl.pieces;
  }
  return total;
}

// Décompose un total de pièces en unités (carton/box/paquet/pièce) pour l'affichage,
// du plus grand au plus petit conditionnement.
function decompose(produit, totalPiecesQty) {
  const levels = unitLevels(produit);
  let reste = Math.max(0, Number(totalPiecesQty) || 0);
  const resultat = {};
  for (const lvl of levels) {
    const qte = Math.floor(reste / lvl.pieces);
    resultat[lvl.key] = qte;
    reste -= qte * lvl.pieces;
  }
  resultat.piece = reste;
  return resultat;
}

function statutStock(produit) {
  if (produit.stock_pieces <= 0) return 'epuise';
  if (produit.stock_pieces <= produit.seuil_minimum) return 'faible';
  return 'normal';
}

function genererNumeroFacture(db) {
  const annee = new Date().getFullYear();
  const row = db.prepare(
    `SELECT COUNT(*) AS n FROM ventes WHERE numero_facture LIKE ?`
  ).get(`FAC-${annee}-%`);
  const n = (row.n || 0) + 1;
  return `FAC-${annee}-${String(n).padStart(4, '0')}`;
}

// ---------------------------------------------------------------------------
// CSV — parsing et génération, délimiteur ';' (compatible Excel en français)
// ---------------------------------------------------------------------------
function parseCSV(texte) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  const s = texte.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ';') { row.push(field); field = ''; }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else field += c;
    }
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows.filter(r => r.some(v => String(v).trim() !== ''));
}

function csvEscape(val) {
  const s = val === null || val === undefined ? '' : String(val);
  if (/[;"\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCSV(headers, rows) {
  const lignes = [headers.map(csvEscape).join(';')];
  for (const r of rows) lignes.push(r.map(csvEscape).join(';'));
  return lignes.join('\n');
}

module.exports = {
  unitLevels, totalPieces, decompose, statutStock, genererNumeroFacture,
  parseCSV, toCSV, csvEscape
};

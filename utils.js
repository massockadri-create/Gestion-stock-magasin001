// Convertit une quantité exprimée en carton/paquet/pièce en un total de pièces,
// selon la configuration du produit (piece_par_paquet, paquet_par_carton).
function totalPieces(produit, qte_carton = 0, qte_paquet = 0, qte_piece = 0) {
  const piecesParCarton = (produit.paquet_par_carton || 1) * (produit.piece_par_paquet || 1);
  return (
    Number(qte_carton || 0) * piecesParCarton +
    Number(qte_paquet || 0) * (produit.piece_par_paquet || 1) +
    Number(qte_piece || 0)
  );
}

// Décompose un total de pièces en cartons/paquets/pièces pour l'affichage.
function decompose(produit, totalPiecesQty) {
  const piecesParPaquet = produit.piece_par_paquet || 1;
  const paquetsParCarton = produit.paquet_par_carton || 1;
  const piecesParCarton = piecesParPaquet * paquetsParCarton;
  let reste = totalPiecesQty;
  const cartons = Math.floor(reste / piecesParCarton);
  reste -= cartons * piecesParCarton;
  const paquets = Math.floor(reste / piecesParPaquet);
  reste -= paquets * piecesParPaquet;
  return { cartons, paquets, pieces: reste };
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

module.exports = { totalPieces, decompose, statutStock, genererNumeroFacture };

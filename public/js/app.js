// ============================================================
// Gestion Cahiers — application front-end (vanilla JS, sans framework)
// ============================================================

const state = {
  token: localStorage.getItem('gc_token') || null,
  user: JSON.parse(localStorage.getItem('gc_user') || 'null'),
  page: 'dashboard',
  produitsCache: [],
  fournisseursCache: [],
  clientsCache: [],
  categoriesCache: [],
  panier: [] // panier de vente en cours
};

const FCFA = n => (Number(n) || 0).toLocaleString('fr-FR') + ' FCFA';

// ---------- Appel API ----------
async function api(method, path, body) {
  const opts = { method, headers: {} };
  if (state.token) opts.headers['Authorization'] = `Bearer ${state.token}`;
  if (body !== undefined) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
  const res = await fetch(`/api${path}`, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Erreur serveur');
  return data;
}

function toast(msg, isError) {
  const el = document.createElement('div');
  el.className = 'toast' + (isError ? ' error' : '');
  el.textContent = msg;
  document.getElementById('toast-root').appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

// ---------- Auth ----------
document.getElementById('login-form').addEventListener('submit', async e => {
  e.preventDefault();
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const errEl = document.getElementById('login-error');
  errEl.textContent = '';
  try {
    const data = await api('POST', '/auth/login', { email, password });
    state.token = data.token; state.user = data.user;
    localStorage.setItem('gc_token', state.token);
    localStorage.setItem('gc_user', JSON.stringify(state.user));
    startApp();
  } catch (err) {
    errEl.textContent = err.message;
  }
});

document.getElementById('logout-btn').addEventListener('click', () => {
  localStorage.removeItem('gc_token'); localStorage.removeItem('gc_user');
  state.token = null; state.user = null;
  document.getElementById('app-screen').classList.remove('active');
  document.getElementById('login-screen').style.display = 'flex';
});

document.getElementById('menu-toggle').addEventListener('click', () => document.getElementById('sidebar').classList.add('open'));
document.getElementById('menu-close').addEventListener('click', () => document.getElementById('sidebar').classList.remove('open'));

// ---------- Navigation ----------
const NAV = [
  { id: 'dashboard', label: 'Tableau de bord', icon: '📊', roles: ['admin','magasinier','caissier'] },
  { id: 'produits', label: 'Produits / Cahiers', icon: '📚', roles: ['admin','magasinier','caissier'] },
  { id: 'entrees', label: 'Entrées', icon: '➕', roles: ['admin','magasinier'] },
  { id: 'sorties', label: 'Sorties', icon: '➖', roles: ['admin','magasinier'] },
  { id: 'ventes', label: 'Ventes & Factures', icon: '🧾', roles: ['admin','caissier'] },
  { id: 'fournisseurs', label: 'Fournisseurs', icon: '🚚', roles: ['admin','magasinier'] },
  { id: 'clients', label: 'Clients', icon: '👤', roles: ['admin','caissier','magasinier'] },
  { id: 'historique', label: 'Historique', icon: '📜', roles: ['admin','magasinier','caissier'] },
  { id: 'rapports', label: 'Rapports', icon: '📈', roles: ['admin'] },
  { id: 'utilisateurs', label: 'Utilisateurs', icon: '🔐', roles: ['admin'] },
];

function canSee(item) { return state.user && (state.user.role === 'admin' || item.roles.includes(state.user.role)); }

function renderNav() {
  const nav = document.getElementById('nav-list');
  nav.innerHTML = NAV.filter(canSee).map(item => `
    <button class="nav-item ${state.page === item.id ? 'active' : ''}" data-page="${item.id}">
      <span class="nav-icon">${item.icon}</span> ${item.label}
    </button>`).join('');
  nav.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => { navigate(btn.dataset.page); document.getElementById('sidebar').classList.remove('open'); });
  });
}

function navigate(page) {
  state.page = page;
  renderNav();
  document.getElementById('topbar-title').textContent = (NAV.find(n => n.id === page) || {}).label || '';
  renderPage();
}

function startApp() {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app-screen').classList.add('active');
  document.getElementById('user-name').textContent = state.user.nom;
  document.getElementById('user-role').textContent = state.user.role;
  navigate(canSee(NAV[0]) ? 'dashboard' : NAV.find(canSee).id);
}

// ---------- Rendu de page (routeur simple) ----------
async function renderPage() {
  const main = document.getElementById('main-content');
  main.innerHTML = '<p style="color:var(--ink-soft)">Chargement…</p>';
  try {
    switch (state.page) {
      case 'dashboard': return renderDashboard(main);
      case 'produits': return renderProduits(main);
      case 'entrees': return renderEntrees(main);
      case 'sorties': return renderSorties(main);
      case 'ventes': return renderVentes(main);
      case 'fournisseurs': return renderFournisseurs(main);
      case 'clients': return renderClients(main);
      case 'historique': return renderHistorique(main);
      case 'rapports': return renderRapports(main);
      case 'utilisateurs': return renderUtilisateurs(main);
      default: main.innerHTML = '<p>Page introuvable</p>';
    }
  } catch (err) {
    main.innerHTML = `<div class="alert-banner epuise">⚠️ ${err.message}</div>`;
  }
}

function unitStack(p, qty) {
  // affiche une quantité en pièces sous forme carton/paquet/pièce, selon le conditionnement du produit
  const piecesParPaquet = p.piece_par_paquet || 1;
  const paquetsParCarton = p.paquet_par_carton || 1;
  const piecesParCarton = piecesParPaquet * paquetsParCarton;
  let reste = qty;
  const c = Math.floor(reste / piecesParCarton); reste -= c * piecesParCarton;
  const pq = Math.floor(reste / piecesParPaquet); reste -= pq * piecesParPaquet;
  const parts = [];
  if (c) parts.push(`<span class="unit-chip"><b>${c}</b> carton${c>1?'s':''}</span>`);
  if (pq) parts.push(`<span class="unit-chip"><b>${pq}</b> paquet${pq>1?'s':''}</span>`);
  if (reste || parts.length === 0) parts.push(`<span class="unit-chip"><b>${reste}</b> pc</span>`);
  return `<span class="unit-stack">${parts.join('')}</span>`;
}

function badgeStatut(s) {
  const map = { normal: '🟢 Normal', faible: '🟠 Faible', epuise: '🔴 Épuisé' };
  return `<span class="badge ${s}">${map[s] || s}</span>`;
}

// =====================================================================
// TABLEAU DE BORD
// =====================================================================
async function renderDashboard(main) {
  const d = await api('GET', '/dashboard');
  main.innerHTML = `
    <div class="page-header"><h2>Tableau de bord</h2></div>
    ${d.nombre_alertes > 0 ? `<div class="alert-banner">⚠️ ${d.nombre_alertes} produit(s) en stock faible ou épuisé — <a href="#" id="go-alertes" style="text-decoration:underline;color:inherit">voir</a></div>` : ''}
    <div class="kpi-grid">
      <div class="kpi"><div class="kpi-label">📦 Cahiers en stock</div><div class="kpi-value">${d.total_cahiers_stock.toLocaleString('fr-FR')}</div></div>
      <div class="kpi gold"><div class="kpi-label">Valeur du stock</div><div class="kpi-value" style="font-size:19px">${FCFA(d.valeur_totale_stock)}</div></div>
      <div class="kpi"><div class="kpi-label">Références actives</div><div class="kpi-value">${d.nombre_references}</div></div>
      <div class="kpi"><div class="kpi-label">➕ Entrées aujourd'hui</div><div class="kpi-value">${d.entrees_aujourdhui}</div></div>
      <div class="kpi"><div class="kpi-label">➖ Sorties aujourd'hui</div><div class="kpi-value">${d.sorties_aujourdhui}</div></div>
      <div class="kpi gold"><div class="kpi-label">Chiffre d'affaires (jour)</div><div class="kpi-value" style="font-size:19px">${FCFA(d.chiffre_affaires_aujourdhui)}</div></div>
      <div class="kpi"><div class="kpi-label">Chiffre d'affaires total</div><div class="kpi-value" style="font-size:19px">${FCFA(d.chiffre_affaires_total)}</div></div>
      <div class="kpi"><div class="kpi-label">Marge bénéficiaire totale</div><div class="kpi-value" style="font-size:19px">${FCFA(d.marge_beneficiaire_totale)}</div></div>
      <div class="kpi red"><div class="kpi-label">⚠️ Alertes de stock</div><div class="kpi-value">${d.nombre_alertes}</div></div>
    </div>
    <div style="display:grid; grid-template-columns: 1.3fr 1fr; gap:16px;" id="dash-cols">
      <div class="card">
        <h3 style="margin-bottom:10px; font-size:16px">Produits presque épuisés</h3>
        ${d.alertes.length ? `<div class="table-wrap"><table><thead><tr><th>Produit</th><th>Stock</th><th>Statut</th></tr></thead><tbody>
          ${d.alertes.map(p => `<tr><td>${p.designation} <span class="mono" style="color:var(--ink-soft)">(${p.reference})</span></td><td>${unitStack(p, p.stock_pieces)}</td><td>${badgeStatut(p.statut)}</td></tr>`).join('')}
        </tbody></table></div>` : `<p style="color:var(--ink-soft)">Aucune alerte — tous les stocks sont au-dessus du seuil.</p>`}
      </div>
      <div class="card">
        <h3 style="margin-bottom:10px; font-size:16px">Produits les plus vendus</h3>
        ${d.produits_plus_vendus.length ? `<div class="table-wrap"><table><thead><tr><th>Produit</th><th>Vendu</th></tr></thead><tbody>
          ${d.produits_plus_vendus.map(p => `<tr><td>${p.designation}${p.pagination ? ` <span class="mono" style="color:var(--ink-soft)">(${p.pagination}p)</span>` : ''}</td><td class="mono">${p.quantite_vendue}</td></tr>`).join('')}
        </tbody></table></div>` : `<p style="color:var(--ink-soft)">Aucune vente enregistrée pour le moment.</p>`}
      </div>
    </div>
  `;
  const goAlertes = document.getElementById('go-alertes');
  if (goAlertes) goAlertes.addEventListener('click', e => { e.preventDefault(); navigate('produits'); setTimeout(() => document.getElementById('filter-statut') && (document.getElementById('filter-statut').value = 'faible', document.getElementById('filter-statut').dispatchEvent(new Event('change'))), 50); });
  if (window.innerWidth < 880) document.getElementById('dash-cols').style.gridTemplateColumns = '1fr';
}

// =====================================================================
// PRODUITS
// =====================================================================
async function loadRefData() {
  const [cats, fours, clis] = await Promise.all([
    api('GET', '/categories'), api('GET', '/fournisseurs'), api('GET', '/clients')
  ]);
  state.categoriesCache = cats; state.fournisseursCache = fours; state.clientsCache = clis;
}

async function renderProduits(main, q = '') {
  await loadRefData().catch(() => {});
  const canEdit = state.user.role === 'admin' || state.user.role === 'magasinier';
  main.innerHTML = `
    <div class="page-header">
      <h2>Produits / Cahiers</h2>
      <div class="actions">
        ${canEdit ? `<button class="btn" id="btn-new-produit">+ Nouveau produit</button>` : ''}
      </div>
    </div>
    <div class="filters">
      <div class="search-bar"><span class="icon">🔎</span><input id="produit-search" placeholder="Rechercher : 100 pages, Clairefontaine, CAH-001, 96 pages Seyès…" value="${q}"></div>
      <select id="filter-categorie"><option value="">Toutes catégories</option>${state.categoriesCache.map(c => `<option value="${c.id}">${c.nom}</option>`).join('')}</select>
      <select id="filter-statut"><option value="">Tous statuts</option><option value="normal">🟢 Normal</option><option value="faible">🟠 Faible</option><option value="epuise">🔴 Épuisé</option></select>
    </div>
    <div id="produits-list"></div>
  `;
  async function refresh() {
    const params = new URLSearchParams();
    const qv = document.getElementById('produit-search').value.trim();
    const cat = document.getElementById('filter-categorie').value;
    const st = document.getElementById('filter-statut').value;
    if (qv) params.set('q', qv);
    if (cat) params.set('categorie_id', cat);
    if (st) params.set('statut', st);
    const produits = await api('GET', `/produits?${params.toString()}`);
    state.produitsCache = produits;
    const list = document.getElementById('produits-list');
    if (!produits.length) { list.innerHTML = `<div class="empty-state card"><div class="glyph">📭</div>Aucun produit ne correspond à cette recherche.</div>`; return; }
    list.innerHTML = `<div class="table-wrap card" style="padding:0"><table><thead><tr>
      <th>Référence</th><th>Désignation</th><th>Pagination</th><th>Marque</th><th>Stock</th><th>Statut</th><th>Prix vente</th><th></th>
    </tr></thead><tbody>
      ${produits.map(p => `<tr>
        <td class="mono">${p.reference}</td>
        <td>${p.designation}</td>
        <td class="mono">${p.pagination ? p.pagination + ' p' : '—'}</td>
        <td>${p.marque || '—'}</td>
        <td>${unitStack(p, p.stock_pieces)}</td>
        <td>${badgeStatut(p.statut)}</td>
        <td class="mono">${FCFA(p.prix_vente)}</td>
        <td><button class="btn small secondary" data-fiche="${p.id}">Fiche</button></td>
      </tr>`).join('')}
    </tbody></table></div>`;
    list.querySelectorAll('[data-fiche]').forEach(b => b.addEventListener('click', () => openFicheProduit(b.dataset.fiche)));
  }
  document.getElementById('produit-search').addEventListener('input', debounce(refresh, 250));
  document.getElementById('filter-categorie').addEventListener('change', refresh);
  document.getElementById('filter-statut').addEventListener('change', refresh);
  if (canEdit) document.getElementById('btn-new-produit').addEventListener('click', openNouveauProduit);
  await refresh();
}

function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

function modal(html) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `<div class="modal">${html}</div>`;
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
  return overlay;
}

function openNouveauProduit() {
  const catOptions = state.categoriesCache.map(c => `<option value="${c.id}">${c.nom}</option>`).join('');
  const ov = modal(`
    <h3>Nouveau produit</h3>
    <form id="form-produit">
      <div class="form-grid">
        <div class="field"><label>Référence *</label><input name="reference" required placeholder="CAH-100"></div>
        <div class="field"><label>Désignation *</label><input name="designation" required placeholder="Cahier 100 pages"></div>
        <div class="field"><label>Pagination (nb pages)</label><input name="pagination" type="number" placeholder="100"></div>
        <div class="field"><label>Format</label><input name="format" placeholder="17x22"></div>
        <div class="field"><label>Marque</label><input name="marque" placeholder="Clairefontaine"></div>
        <div class="field"><label>Type</label><input name="type_produit" placeholder="Seyès"></div>
        <div class="field"><label>Couverture</label><input name="couverture" placeholder="Cartonnée"></div>
        <div class="field"><label>Catégorie</label><select name="categorie_id"><option value="">—</option>${catOptions}</select></div>
        <div class="field"><label>Pièces / paquet</label><input name="piece_par_paquet" type="number" value="10" required></div>
        <div class="field"><label>Paquets / carton</label><input name="paquet_par_carton" type="number" value="10" required></div>
        <div class="field"><label>Stock initial (pièces)</label><input name="stock_initial" type="number" value="0"></div>
        <div class="field"><label>Seuil minimum (pièces)</label><input name="seuil_minimum" type="number" value="0"></div>
        <div class="field"><label>Prix d'achat (FCFA)</label><input name="prix_achat" type="number" value="0"></div>
        <div class="field"><label>Prix de vente (FCFA)</label><input name="prix_vente" type="number" value="0"></div>
      </div>
      <div class="modal-actions">
        <button type="button" class="btn secondary" id="cancel-produit">Annuler</button>
        <button type="submit" class="btn">Enregistrer</button>
      </div>
    </form>
  `);
  ov.querySelector('#cancel-produit').addEventListener('click', () => ov.remove());
  ov.querySelector('#form-produit').addEventListener('submit', async e => {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(e.target));
    try {
      await api('POST', '/produits', fd);
      toast('Produit créé avec succès');
      ov.remove(); renderPage();
    } catch (err) { toast(err.message, true); }
  });
}

async function openFicheProduit(id) {
  const p = await api('GET', `/produits/${id}`);
  const ov = modal(`
    <h3>📚 ${p.designation}</h3>
    <div class="produit-fiche-header">
      <div class="mono" style="color:var(--ink-soft)">${p.reference} ${p.pagination ? '· ' + p.pagination + ' pages' : ''} ${p.marque ? '· ' + p.marque : ''}</div>
      ${badgeStatut(p.statut)}
    </div>
    <div class="stat-line"><span>Stock actuel</span><b>${unitStack(p, p.stock_pieces)}</b></div>
    <div class="stat-line"><span>Stock initial</span><b>${p.stock_initial} pièces</b></div>
    <div class="stat-line"><span>Total entrées</span><b>+${p.total_entrees}</b></div>
    <div class="stat-line"><span>Total sorties</span><b>-${p.total_sorties}</b></div>
    <div class="stat-line"><span>Prix d'achat</span><b>${FCFA(p.prix_achat)}</b></div>
    <div class="stat-line"><span>Prix de vente</span><b>${FCFA(p.prix_vente)}</b></div>
    <div class="stat-line"><span>Valeur du stock</span><b>${FCFA(p.valeur_stock)}</b></div>
    <div class="stat-line"><span>Seuil minimum</span><b>${p.seuil_minimum} pièces</b></div>
    <div class="stat-line"><span>Dernière sortie</span><b>${p.derniere_sortie ? new Date(p.derniere_sortie).toLocaleString('fr-FR') : '—'}</b></div>

    <h3 style="font-size:14px; margin:18px 0 8px">Historique des mouvements</h3>
    <div class="table-wrap" style="max-height:260px; overflow-y:auto">
      <table><thead><tr><th>Date</th><th>Type</th><th>Qté</th><th>Solde</th><th>Par</th></tr></thead><tbody>
        ${p.historique.map(m => `<tr>
          <td class="mono">${new Date(m.date).toLocaleString('fr-FR')}</td>
          <td>${m.type_mouvement}</td>
          <td class="mono" style="color:${m.quantite>=0?'var(--green-dark)':'var(--red)'}">${m.quantite>=0?'+':''}${m.quantite}</td>
          <td class="mono">${m.stock_apres}</td>
          <td>${m.utilisateur_nom || '—'}</td>
        </tr>`).join('') || '<tr><td colspan="5" style="text-align:center;color:var(--ink-soft)">Aucun mouvement</td></tr>'}
      </tbody></table>
    </div>
    <div class="modal-actions"><button class="btn secondary" id="close-fiche">Fermer</button></div>
  `);
  ov.querySelector('#close-fiche').addEventListener('click', () => ov.remove());
}

// =====================================================================
// ENTRÉES
// =====================================================================
async function renderEntrees(main) {
  await loadRefData().catch(() => {});
  const produits = await api('GET', '/produits');
  state.produitsCache = produits;
  const entrees = await api('GET', '/entrees');

  main.innerHTML = `
    <div class="page-header"><h2>➕ Entrées de marchandises</h2>
      <div class="actions"><button class="btn" id="btn-new-entree">+ Nouvelle entrée</button></div>
    </div>
    <div class="table-wrap card" style="padding:0">
      <table><thead><tr><th>Date</th><th>Produit</th><th>Fournisseur</th><th>N° bon</th><th>Quantité</th><th>Total</th><th>Par</th></tr></thead><tbody>
        ${entrees.map(e => `<tr>
          <td class="mono">${new Date(e.date).toLocaleString('fr-FR')}</td>
          <td>${e.designation} <span class="mono" style="color:var(--ink-soft)">(${e.reference})</span></td>
          <td>${e.fournisseur_nom || '—'}</td>
          <td class="mono">${e.numero_bon || '—'}</td>
          <td class="mono">+${e.qte_totale_pieces}</td>
          <td class="mono">${FCFA(e.total)}</td>
          <td>${e.utilisateur_nom || '—'}</td>
        </tr>`).join('') || `<tr><td colspan="7" style="text-align:center;color:var(--ink-soft);padding:24px">Aucune entrée enregistrée</td></tr>`}
      </tbody></table>
    </div>
  `;
  document.getElementById('btn-new-entree').addEventListener('click', openNouvelleEntree);
}

function selectProduitOptions() {
  return state.produitsCache.map(p => `<option value="${p.id}">${p.designation} — ${p.reference}${p.pagination ? ` (${p.pagination}p)` : ''}</option>`).join('');
}

function openNouvelleEntree() {
  const fourOptions = state.fournisseursCache.map(f => `<option value="${f.id}">${f.nom}</option>`).join('');
  const ov = modal(`
    <h3>Nouvelle entrée</h3>
    <form id="form-entree">
      <div class="form-grid">
        <div class="field span2"><label>Produit *</label><select name="produit_id" required>${selectProduitOptions()}</select></div>
        <div class="field"><label>Fournisseur</label><select name="fournisseur_id"><option value="">—</option>${fourOptions}</select></div>
        <div class="field"><label>N° bon de livraison</label><input name="numero_bon"></div>
        <div class="field"><label>Quantité — cartons</label><input name="qte_carton" type="number" value="0"></div>
        <div class="field"><label>Quantité — paquets</label><input name="qte_paquet" type="number" value="0"></div>
        <div class="field"><label>Quantité — pièces</label><input name="qte_piece" type="number" value="0"></div>
        <div class="field"><label>Prix d'achat unitaire (FCFA)</label><input name="prix_achat_unitaire" type="number" placeholder="Prix par pièce"></div>
        <div class="field span2"><label>Note</label><input name="note"></div>
      </div>
      <p class="hint" style="color:var(--ink-soft); font-size:12px; margin-top:6px">Le total en pièces est calculé automatiquement selon le conditionnement du produit choisi (1 carton = paquets × pièces).</p>
      <div class="modal-actions">
        <button type="button" class="btn secondary" id="cancel-entree">Annuler</button>
        <button type="submit" class="btn">Enregistrer l'entrée</button>
      </div>
    </form>
  `);
  ov.querySelector('#cancel-entree').addEventListener('click', () => ov.remove());
  ov.querySelector('#form-entree').addEventListener('submit', async e => {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(e.target));
    try {
      const r = await api('POST', '/entrees', fd);
      toast(`Entrée enregistrée : +${r.qteTotale} pièces (nouveau stock : ${r.nouveauStock})`);
      ov.remove(); renderPage();
    } catch (err) { toast(err.message, true); }
  });
}

// =====================================================================
// SORTIES
// =====================================================================
async function renderSorties(main) {
  await loadRefData().catch(() => {});
  const produits = await api('GET', '/produits');
  state.produitsCache = produits;

  main.innerHTML = `
    <div class="page-header"><h2>➖ Sorties de stock</h2>
      <div class="actions"><button class="btn" id="btn-new-sortie">+ Nouvelle sortie</button></div>
    </div>
    <div class="tabs-inline" id="sortie-tabs">
      ${['','client','commerce','librairie','autre'].map(t => `<button data-t="${t}" class="${t===''?'active':''}">${t===''?'Toutes':({client:'Sortie Client',commerce:'Sortie Commerce',librairie:'Sortie Librairie',autre:'Autres sorties'})[t]}</button>`).join('')}
    </div>
    <div id="sorties-list"></div>
  `;
  async function loadType(t) {
    const sorties = await api('GET', `/sorties${t ? `?type_sortie=${t}` : ''}`);
    document.getElementById('sorties-list').innerHTML = `
      <div class="table-wrap card" style="padding:0">
        <table><thead><tr><th>Date</th><th>Type</th><th>Produit</th><th>Client</th><th>Quantité</th><th>Par</th></tr></thead><tbody>
          ${sorties.map(s => `<tr>
            <td class="mono">${new Date(s.date).toLocaleString('fr-FR')}</td>
            <td>${({client:'Client',commerce:'Commerce',librairie:'Librairie',autre:'Autre'})[s.type_sortie]}</td>
            <td>${s.designation} <span class="mono" style="color:var(--ink-soft)">(${s.reference})</span></td>
            <td>${s.client_nom || '—'}</td>
            <td class="mono" style="color:var(--red)">-${s.qte_totale_pieces}</td>
            <td>${s.utilisateur_nom || '—'}</td>
          </tr>`).join('') || `<tr><td colspan="6" style="text-align:center;color:var(--ink-soft);padding:24px">Aucune sortie enregistrée</td></tr>`}
        </tbody></table>
      </div>`;
  }
  document.getElementById('sortie-tabs').addEventListener('click', e => {
    if (e.target.tagName !== 'BUTTON') return;
    document.querySelectorAll('#sortie-tabs button').forEach(b => b.classList.remove('active'));
    e.target.classList.add('active');
    loadType(e.target.dataset.t);
  });
  document.getElementById('btn-new-sortie').addEventListener('click', openNouvelleSortie);
  await loadType('');
}

function openNouvelleSortie() {
  const cliOptions = state.clientsCache.map(c => `<option value="${c.id}">${c.nom}</option>`).join('');
  const ov = modal(`
    <h3>Nouvelle sortie</h3>
    <form id="form-sortie">
      <div class="form-grid">
        <div class="field"><label>Type de sortie *</label>
          <select name="type_sortie" required>
            <option value="client">Sortie Client</option>
            <option value="commerce">Sortie Commerce</option>
            <option value="librairie">Sortie Librairie</option>
            <option value="autre">Autre sortie</option>
          </select>
        </div>
        <div class="field"><label>Client (optionnel)</label><select name="client_id"><option value="">—</option>${cliOptions}</select></div>
        <div class="field span2"><label>Produit *</label><select name="produit_id" required>${selectProduitOptions()}</select></div>
        <div class="field"><label>Quantité — cartons</label><input name="qte_carton" type="number" value="0"></div>
        <div class="field"><label>Quantité — paquets</label><input name="qte_paquet" type="number" value="0"></div>
        <div class="field"><label>Quantité — pièces</label><input name="qte_piece" type="number" value="0"></div>
        <div class="field span2"><label>Note</label><input name="note"></div>
      </div>
      <div class="modal-actions">
        <button type="button" class="btn secondary" id="cancel-sortie">Annuler</button>
        <button type="submit" class="btn">Enregistrer la sortie</button>
      </div>
    </form>
  `);
  ov.querySelector('#cancel-sortie').addEventListener('click', () => ov.remove());
  ov.querySelector('#form-sortie').addEventListener('submit', async e => {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(e.target));
    try {
      const r = await api('POST', '/sorties', fd);
      toast(`Sortie enregistrée : -${r.qteTotale} pièces (nouveau stock : ${r.nouveauStock})`);
      ov.remove(); renderPage();
    } catch (err) { toast(err.message, true); }
  });
}

// =====================================================================
// VENTES / FACTURATION
// =====================================================================
async function renderVentes(main) {
  await loadRefData().catch(() => {});
  const produits = await api('GET', '/produits');
  state.produitsCache = produits;
  const ventes = await api('GET', '/ventes');

  main.innerHTML = `
    <div class="page-header"><h2>🧾 Ventes &amp; Factures</h2>
      <div class="actions"><button class="btn" id="btn-new-vente">+ Nouvelle vente</button></div>
    </div>
    <div class="table-wrap card" style="padding:0">
      <table><thead><tr><th>N° Facture</th><th>Date</th><th>Client</th><th>Total</th><th>Paiement</th><th>Statut</th><th></th></tr></thead><tbody>
        ${ventes.map(v => `<tr>
          <td class="mono">${v.numero_facture}</td>
          <td class="mono">${new Date(v.date).toLocaleString('fr-FR')}</td>
          <td>${v.client_nom || 'Client comptant'}</td>
          <td class="mono">${FCFA(v.total)}</td>
          <td>${v.mode_paiement}</td>
          <td>${v.statut === 'validee' ? '<span class="badge normal">Validée</span>' : '<span class="badge epuise">Annulée</span>'}</td>
          <td><button class="btn small secondary" data-facture="${v.id}">Voir facture</button></td>
        </tr>`).join('') || `<tr><td colspan="7" style="text-align:center;color:var(--ink-soft);padding:24px">Aucune vente enregistrée</td></tr>`}
      </tbody></table>
    </div>
  `;
  main.querySelectorAll('[data-facture]').forEach(b => b.addEventListener('click', () => ouvrirFacture(b.dataset.facture)));
  document.getElementById('btn-new-vente').addEventListener('click', openNouvelleVente);
}

function openNouvelleVente() {
  state.panier = [];
  const cliOptions = state.clientsCache.map(c => `<option value="${c.id}">${c.nom}</option>`).join('');
  const ov = modal(`
    <h3>Nouvelle vente</h3>
    <div class="form-grid" style="margin-bottom:12px">
      <div class="field"><label>Client</label><select id="vente-client"><option value="">Client comptant</option>${cliOptions}</select></div>
      <div class="field"><label>Mode de paiement</label>
        <select id="vente-paiement">
          <option value="especes">Espèces</option>
          <option value="orange_money">Orange Money</option>
          <option value="mtn_momo">MTN MoMo</option>
          <option value="autre">Autre</option>
        </select>
      </div>
    </div>
    <div class="form-grid" style="align-items:end; margin-bottom:10px">
      <div class="field span2"><label>Produit</label><select id="ligne-produit">${selectProduitOptions()}</select></div>
      <div class="field"><label>Quantité (pièces)</label><input id="ligne-qte" type="number" value="1" min="1"></div>
      <div class="field"><button type="button" class="btn secondary" id="btn-add-ligne" style="width:100%; justify-content:center">Ajouter</button></div>
    </div>
    <div class="table-wrap"><table><thead><tr><th>Produit</th><th>Qté</th><th>PU</th><th>Sous-total</th><th></th></tr></thead>
      <tbody id="panier-body"><tr><td colspan="5" style="text-align:center;color:var(--ink-soft)">Panier vide</td></tr></tbody>
    </table></div>
    <div class="stat-line" style="font-size:16px; margin-top:10px"><span>Total</span><b id="panier-total">0 FCFA</b></div>
    <div class="modal-actions">
      <button type="button" class="btn secondary" id="cancel-vente">Annuler</button>
      <button type="button" class="btn" id="btn-valider-vente">Valider &amp; facturer</button>
    </div>
  `);

  function renderPanier() {
    const body = document.getElementById('panier-body');
    if (!state.panier.length) { body.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--ink-soft)">Panier vide</td></tr>'; }
    else {
      body.innerHTML = state.panier.map((l, i) => `<tr>
        <td>${l.designation}</td><td class="mono">${l.qte_pieces}</td><td class="mono">${FCFA(l.prix_unitaire)}</td>
        <td class="mono">${FCFA(l.prix_unitaire * l.qte_pieces)}</td>
        <td><button class="btn small danger" data-rm="${i}">✕</button></td>
      </tr>`).join('');
    }
    const total = state.panier.reduce((s, l) => s + l.prix_unitaire * l.qte_pieces, 0);
    document.getElementById('panier-total').textContent = FCFA(total);
    body.querySelectorAll('[data-rm]').forEach(b => b.addEventListener('click', () => { state.panier.splice(+b.dataset.rm, 1); renderPanier(); }));
  }

  ov.querySelector('#btn-add-ligne').addEventListener('click', () => {
    const produitId = document.getElementById('ligne-produit').value;
    const qte = Number(document.getElementById('ligne-qte').value);
    const produit = state.produitsCache.find(p => String(p.id) === produitId);
    if (!produit || qte <= 0) return;
    state.panier.push({ produit_id: produit.id, designation: produit.designation, qte_pieces: qte, prix_unitaire: produit.prix_vente });
    renderPanier();
  });

  ov.querySelector('#cancel-vente').addEventListener('click', () => ov.remove());
  ov.querySelector('#btn-valider-vente').addEventListener('click', async () => {
    if (!state.panier.length) { toast('Ajoutez au moins un produit', true); return; }
    try {
      const r = await api('POST', '/ventes', {
        client_id: document.getElementById('vente-client').value || null,
        mode_paiement: document.getElementById('vente-paiement').value,
        lignes: state.panier.map(l => ({ produit_id: l.produit_id, qte_pieces: l.qte_pieces, prix_unitaire: l.prix_unitaire }))
      });
      toast(`Facture ${r.numero_facture} générée — ${FCFA(r.total)}`);
      ov.remove(); renderPage();
      ouvrirFacture(r.id);
    } catch (err) { toast(err.message, true); }
  });

  renderPanier();
}

async function ouvrirFacture(id) {
  const v = await api('GET', `/ventes/${id}`);
  const ov = modal(`
    <div class="invoice-preview">
      <div class="inv-head">
        <h2>LGS Web Solutions — Librairie</h2>
        <div>Facture N° <b>${v.numero_facture}</b></div>
        <div>${new Date(v.date).toLocaleString('fr-FR')}</div>
      </div>
      <div>Client : <b>${v.client_nom || 'Client comptant'}</b> ${v.client_contact ? `(${v.client_contact})` : ''}</div>
      <div>Mode de paiement : ${v.mode_paiement}</div>
      <table><thead><tr><th>Produit</th><th>Qté</th><th>PU</th><th>Sous-total</th></tr></thead><tbody>
        ${v.lignes.map(l => `<tr><td>${l.designation}${l.pagination ? ` (${l.pagination}p)` : ''}</td><td>${l.qte_pieces}</td><td>${FCFA(l.prix_unitaire)}</td><td>${FCFA(l.sous_total)}</td></tr>`).join('')}
      </tbody></table>
      <div class="inv-total">Total : <b>${FCFA(v.total)}</b></div>
      ${v.statut === 'annulee' ? '<p style="color:var(--red); text-align:center; margin-top:10px">** FACTURE ANNULÉE **</p>' : ''}
    </div>
    <div class="modal-actions no-print">
      ${state.user.role === 'admin' && v.statut === 'validee' ? `<button class="btn danger" id="btn-annuler-vente">Annuler la vente</button>` : ''}
      <button class="btn secondary" id="btn-print-facture">🖨️ Imprimer / PDF</button>
      <button class="btn" id="close-facture">Fermer</button>
    </div>
  `);
  ov.querySelector('#close-facture').addEventListener('click', () => ov.remove());
  ov.querySelector('#btn-print-facture').addEventListener('click', () => window.print());
  const btnAnnuler = ov.querySelector('#btn-annuler-vente');
  if (btnAnnuler) btnAnnuler.addEventListener('click', async () => {
    if (!confirm('Confirmer l\'annulation de cette vente ? Le stock sera réapprovisionné.')) return;
    await api('POST', `/ventes/${id}/annuler`);
    toast('Vente annulée, stock réapprovisionné');
    ov.remove(); renderPage();
  });
}

// =====================================================================
// FOURNISSEURS
// =====================================================================
async function renderFournisseurs(main) {
  const fournisseurs = await api('GET', '/fournisseurs');
  main.innerHTML = `
    <div class="page-header"><h2>🚚 Fournisseurs</h2><div class="actions"><button class="btn" id="btn-new-fournisseur">+ Nouveau</button></div></div>
    <div class="table-wrap card" style="padding:0"><table><thead><tr><th>Nom</th><th>Contact</th><th>Adresse</th><th></th></tr></thead><tbody>
      ${fournisseurs.map(f => `<tr><td>${f.nom}</td><td>${f.contact||'—'}</td><td>${f.adresse||'—'}</td><td><button class="btn small danger" data-del="${f.id}">Supprimer</button></td></tr>`).join('') || `<tr><td colspan="4" style="text-align:center;color:var(--ink-soft);padding:24px">Aucun fournisseur</td></tr>`}
    </tbody></table></div>`;
  document.getElementById('btn-new-fournisseur').addEventListener('click', () => {
    const ov = modal(`<h3>Nouveau fournisseur</h3><form id="f-form">
      <div class="form-grid"><div class="field"><label>Nom *</label><input name="nom" required></div>
      <div class="field"><label>Contact</label><input name="contact"></div>
      <div class="field span2"><label>Adresse</label><input name="adresse"></div></div>
      <div class="modal-actions"><button type="button" class="btn secondary" id="c">Annuler</button><button class="btn" type="submit">Enregistrer</button></div>
    </form>`);
    ov.querySelector('#c').addEventListener('click', () => ov.remove());
    ov.querySelector('#f-form').addEventListener('submit', async e => {
      e.preventDefault();
      await api('POST', '/fournisseurs', Object.fromEntries(new FormData(e.target)));
      ov.remove(); toast('Fournisseur ajouté'); renderPage();
    });
  });
  main.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', async () => {
    if (!confirm('Supprimer ce fournisseur ?')) return;
    await api('DELETE', `/fournisseurs/${b.dataset.del}`); renderPage();
  }));
}

// =====================================================================
// CLIENTS
// =====================================================================
async function renderClients(main) {
  const clients = await api('GET', '/clients');
  main.innerHTML = `
    <div class="page-header"><h2>👤 Clients</h2><div class="actions"><button class="btn" id="btn-new-client">+ Nouveau</button></div></div>
    <div class="table-wrap card" style="padding:0"><table><thead><tr><th>Nom</th><th>Type</th><th>Contact</th><th>Adresse</th><th></th></tr></thead><tbody>
      ${clients.map(c => `<tr><td>${c.nom}</td><td>${c.type_client}</td><td>${c.contact||'—'}</td><td>${c.adresse||'—'}</td><td><button class="btn small danger" data-del="${c.id}">Supprimer</button></td></tr>`).join('') || `<tr><td colspan="5" style="text-align:center;color:var(--ink-soft);padding:24px">Aucun client</td></tr>`}
    </tbody></table></div>`;
  document.getElementById('btn-new-client').addEventListener('click', () => {
    const ov = modal(`<h3>Nouveau client</h3><form id="f-form">
      <div class="form-grid"><div class="field"><label>Nom *</label><input name="nom" required></div>
      <div class="field"><label>Type</label><select name="type_client"><option value="particulier">Particulier</option><option value="commerce">Commerce</option><option value="librairie">Librairie</option></select></div>
      <div class="field"><label>Contact</label><input name="contact"></div>
      <div class="field"><label>Adresse</label><input name="adresse"></div></div>
      <div class="modal-actions"><button type="button" class="btn secondary" id="c">Annuler</button><button class="btn" type="submit">Enregistrer</button></div>
    </form>`);
    ov.querySelector('#c').addEventListener('click', () => ov.remove());
    ov.querySelector('#f-form').addEventListener('submit', async e => {
      e.preventDefault();
      await api('POST', '/clients', Object.fromEntries(new FormData(e.target)));
      ov.remove(); toast('Client ajouté'); renderPage();
    });
  });
  main.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', async () => {
    if (!confirm('Supprimer ce client ?')) return;
    await api('DELETE', `/clients/${b.dataset.del}`); renderPage();
  }));
}

// =====================================================================
// HISTORIQUE
// =====================================================================
async function renderHistorique(main) {
  await loadRefData().catch(() => {});
  const produits = await api('GET', '/produits');
  state.produitsCache = produits;
  main.innerHTML = `
    <div class="page-header"><h2>📜 Historique des mouvements</h2></div>
    <div class="filters">
      <select id="h-produit"><option value="">Tous les produits</option>${produits.map(p => `<option value="${p.id}">${p.designation} (${p.reference})</option>`).join('')}</select>
      <select id="h-type"><option value="">Tous les types</option>
        <option value="entree">Entrées</option><option value="sortie_client">Sortie Client</option>
        <option value="sortie_commerce">Sortie Commerce</option><option value="sortie_librairie">Sortie Librairie</option>
        <option value="sortie_autre">Autre sortie</option><option value="vente">Vente</option><option value="ajustement">Ajustement</option>
      </select>
      <input type="date" id="h-debut"><input type="date" id="h-fin">
    </div>
    <div id="h-list"></div>
  `;
  async function refresh() {
    const params = new URLSearchParams();
    const pid = document.getElementById('h-produit').value;
    const t = document.getElementById('h-type').value;
    const d1 = document.getElementById('h-debut').value;
    const d2 = document.getElementById('h-fin').value;
    if (pid) params.set('produit_id', pid);
    if (t) params.set('type_mouvement', t);
    if (d1) params.set('date_debut', d1);
    if (d2) params.set('date_fin', d2);
    const rows = await api('GET', `/mouvements?${params}`);
    document.getElementById('h-list').innerHTML = `
      <div class="table-wrap card" style="padding:0"><table><thead><tr><th>Date</th><th>Produit</th><th>Mouvement</th><th>Quantité</th><th>Solde</th><th>Utilisateur</th></tr></thead><tbody>
        ${rows.map(m => `<tr>
          <td class="mono">${new Date(m.date).toLocaleString('fr-FR')}</td>
          <td>${m.designation} <span class="mono" style="color:var(--ink-soft)">(${m.reference})</span></td>
          <td>${m.type_mouvement}</td>
          <td class="mono" style="color:${m.quantite>=0?'var(--green-dark)':'var(--red)'}">${m.quantite>=0?'+':''}${m.quantite}</td>
          <td class="mono">${m.stock_apres}</td>
          <td>${m.utilisateur_nom || '—'}</td>
        </tr>`).join('') || `<tr><td colspan="6" style="text-align:center;color:var(--ink-soft);padding:24px">Aucun mouvement</td></tr>`}
      </tbody></table></div>`;
  }
  ['h-produit','h-type','h-debut','h-fin'].forEach(id => document.getElementById(id).addEventListener('change', refresh));
  await refresh();
}

// =====================================================================
// RAPPORTS (admin)
// =====================================================================
async function renderRapports(main) {
  const d = await api('GET', '/dashboard');
  main.innerHTML = `
    <div class="page-header"><h2>📈 Rapports</h2></div>
    <div class="kpi-grid">
      <div class="kpi"><div class="kpi-label">Valeur totale du stock</div><div class="kpi-value" style="font-size:20px">${FCFA(d.valeur_totale_stock)}</div></div>
      <div class="kpi gold"><div class="kpi-label">Chiffre d'affaires total</div><div class="kpi-value" style="font-size:20px">${FCFA(d.chiffre_affaires_total)}</div></div>
      <div class="kpi"><div class="kpi-label">Marge bénéficiaire totale</div><div class="kpi-value" style="font-size:20px">${FCFA(d.marge_beneficiaire_totale)}</div></div>
    </div>
    <div class="card">
      <h3 style="margin-bottom:10px; font-size:16px">Classement des produits les plus vendus</h3>
      <div class="table-wrap"><table><thead><tr><th>#</th><th>Produit</th><th>Pagination</th><th>Quantité vendue</th></tr></thead><tbody>
        ${d.produits_plus_vendus.map((p,i) => `<tr><td class="mono">${i+1}</td><td>${p.designation}</td><td class="mono">${p.pagination?p.pagination+' p':'—'}</td><td class="mono">${p.quantite_vendue}</td></tr>`).join('') || `<tr><td colspan="4" style="text-align:center;color:var(--ink-soft);padding:24px">Aucune donnée</td></tr>`}
      </tbody></table></div>
    </div>
  `;
}

// =====================================================================
// UTILISATEURS (admin)
// =====================================================================
async function renderUtilisateurs(main) {
  const users = await api('GET', '/utilisateurs');
  main.innerHTML = `
    <div class="page-header"><h2>🔐 Utilisateurs</h2><div class="actions"><button class="btn" id="btn-new-user">+ Nouvel utilisateur</button></div></div>
    <div class="table-wrap card" style="padding:0"><table><thead><tr><th>Nom</th><th>E-mail</th><th>Rôle</th><th>Statut</th><th></th></tr></thead><tbody>
      ${users.map(u => `<tr><td>${u.nom}</td><td>${u.email}</td><td>${u.role}</td><td>${u.actif ? '<span class="badge normal">Actif</span>' : '<span class="badge epuise">Désactivé</span>'}</td>
        <td>${u.actif ? `<button class="btn small danger" data-deact="${u.id}">Désactiver</button>` : ''}</td></tr>`).join('')}
    </tbody></table></div>
    <p style="color:var(--ink-soft); font-size:12px; margin-top:10px">Rôles — <b>Administrateur</b> : accès complet. <b>Magasinier</b> : entrées, sorties, consultation du stock. <b>Caissier</b> : ventes et factures.</p>
  `;
  document.getElementById('btn-new-user').addEventListener('click', () => {
    const ov = modal(`<h3>Nouvel utilisateur</h3><form id="u-form">
      <div class="form-grid">
        <div class="field"><label>Nom *</label><input name="nom" required></div>
        <div class="field"><label>E-mail *</label><input name="email" type="email" required></div>
        <div class="field"><label>Mot de passe *</label><input name="password" type="password" required></div>
        <div class="field"><label>Rôle *</label><select name="role"><option value="magasinier">Magasinier</option><option value="caissier">Caissier</option><option value="admin">Administrateur</option></select></div>
      </div>
      <div class="modal-actions"><button type="button" class="btn secondary" id="c">Annuler</button><button class="btn" type="submit">Créer</button></div>
    </form>`);
    ov.querySelector('#c').addEventListener('click', () => ov.remove());
    ov.querySelector('#u-form').addEventListener('submit', async e => {
      e.preventDefault();
      try {
        await api('POST', '/utilisateurs', Object.fromEntries(new FormData(e.target)));
        ov.remove(); toast('Utilisateur créé'); renderPage();
      } catch (err) { toast(err.message, true); }
    });
  });
  main.querySelectorAll('[data-deact]').forEach(b => b.addEventListener('click', async () => {
    if (!confirm('Désactiver cet utilisateur ?')) return;
    await api('DELETE', `/utilisateurs/${b.dataset.deact}`); renderPage();
  }));
}

// ---------- Démarrage ----------
if (state.token && state.user) startApp();

'use strict';

/* ================================================================
   FIREBASE CONFIG
   ─────────────────────────────────────────────────────────────────
   1. Go to https://console.firebase.google.com
   2. Create a project → Add a web app → copy the config below
   3. In Firestore Database → Create database (Start in test mode)
   4. Replace EVERY "REPLACE_..." value with your actual values
   5. Commit & push → Vercel auto-deploys
================================================================ */
const FIREBASE_CONFIG = {
  apiKey:            "REPLACE_API_KEY",
  authDomain:        "REPLACE_PROJECT_ID.firebaseapp.com",
  projectId:         "REPLACE_PROJECT_ID",
  storageBucket:     "REPLACE_PROJECT_ID.appspot.com",
  messagingSenderId: "REPLACE_MESSAGING_SENDER_ID",
  appId:             "REPLACE_APP_ID",
};

/* ================================================================
   CONSTANTS
================================================================ */
const PASSWORD     = 'etsy123';
const DEFAULT_COLS = ['Supplier Name', 'Website', 'Price', 'MOQ', 'Contacted', 'Notes'];

/* ================================================================
   FIREBASE INIT
================================================================ */
const _app = firebase.initializeApp(FIREBASE_CONFIG);
const db   = firebase.firestore();

let _unsubProducts = null;
let _unsubTodos    = null;

/* ================================================================
   STATE
================================================================ */
let state = {
  products:      [],
  activeFilters: [],
  searchQuery:   '',
  showArchived:  false,
  editingId:     null,
  detailId:      null,
};

let todos          = [];
let filterMenuOpen = false;

/* ================================================================
   FIRESTORE — LISTENERS
================================================================ */
function startListeners() {
  showDbLoading(true);

  _unsubProducts = db.collection('products')
    .orderBy('createdAt', 'desc')
    .onSnapshot(snap => {
      state.products = snap.docs.map(d => d.data());
      renderApp();
      // Refresh detail modal if open and no cell is actively being edited
      if (state.detailId && !document.getElementById('detail-modal').classList.contains('hidden')) {
        if (!document.querySelector('.t-cell.editing')) {
          const updated = state.products.find(p => p.id === state.detailId);
          if (updated) renderDetailContent(updated);
        }
      }
      showDbLoading(false);
    }, err => {
      console.error('Firestore products error:', err);
      showDbLoading(false);
    });

  _unsubTodos = db.collection('todos')
    .orderBy('createdAt', 'desc')
    .onSnapshot(snap => {
      todos = snap.docs.map(d => d.data());
      renderTodoList();
    }, err => {
      console.error('Firestore todos error:', err);
    });
}

function stopListeners() {
  _unsubProducts?.();
  _unsubTodos?.();
  _unsubProducts = null;
  _unsubTodos    = null;
}

function showDbLoading(show) {
  document.getElementById('db-loading')?.classList.toggle('hidden', !show);
}

/* ================================================================
   FIRESTORE — PRODUCT WRITES
================================================================ */
async function fsSetProduct(product) {
  await db.collection('products').doc(product.id).set(product);
}

async function fsUpdateProduct(id, fields) {
  await db.collection('products').doc(id).update(fields);
}

async function fsDeleteProduct(id) {
  await db.collection('products').doc(id).delete();
}

/* ================================================================
   FIRESTORE — TODO WRITES
================================================================ */
async function fsSetTodo(todo) {
  await db.collection('todos').doc(todo.id).set(todo);
}

async function fsUpdateTodo(id, fields) {
  await db.collection('todos').doc(id).update(fields);
}

async function fsDeleteTodo(id) {
  await db.collection('todos').doc(id).delete();
}

/* ================================================================
   AUTH
================================================================ */
function isAuthed() { return sessionStorage.getItem('etsy_db_auth') === '1'; }

function doLogin(pw) {
  if (pw === PASSWORD) { sessionStorage.setItem('etsy_db_auth', '1'); return true; }
  return false;
}

function doLogout() {
  stopListeners();
  sessionStorage.removeItem('etsy_db_auth');
  showView('login');
}

/* ================================================================
   UTILITIES
================================================================ */
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function extractNameFromEtsyUrl(url) {
  try {
    const u = new URL(url.trim());
    if (!u.hostname.includes('etsy.com')) return '';
    const parts = u.pathname.split('/').filter(Boolean);
    if (parts[0] === 'listing' && parts.length >= 3) {
      return parts[2].split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    }
  } catch (_) {}
  return '';
}

function getAllTags() {
  const s = new Set();
  state.products.forEach(p => p.tags.forEach(t => s.add(t)));
  return [...s].sort();
}

function getTagCount(tag) {
  return state.products.filter(p => !p.archived && p.tags.includes(tag)).length;
}

function getVisibleProducts() {
  let list = state.products.filter(p => !!p.archived === state.showArchived);

  if (state.searchQuery.trim()) {
    const q = state.searchQuery.toLowerCase();
    list = list.filter(p =>
      p.name.toLowerCase().includes(q) ||
      p.tags.some(t => t.toLowerCase().includes(q)) ||
      (p.notes || '').toLowerCase().includes(q)
    );
  }

  if (state.activeFilters.length > 0) {
    list = list.filter(p => state.activeFilters.some(tag => p.tags.includes(tag)));
  }

  list.sort((a, b) => {
    if (a.starred && !b.starred) return -1;
    if (!a.starred && b.starred) return 1;
    return b.createdAt - a.createdAt;
  });

  return list;
}

/* ================================================================
   VIEW CONTROL
================================================================ */
function showView(view) {
  document.getElementById('login-screen').classList.toggle('hidden', view !== 'login');
  document.getElementById('app').classList.toggle('hidden', view !== 'app');
  if (view === 'app') {
    startListeners();
  }
}

/* ================================================================
   RENDER — FULL APP
================================================================ */
function renderApp() {
  renderFilterMenu();
  renderActiveChips();
  renderProductGrid();
}

/* ================================================================
   FILTER DROPDOWN
================================================================ */
function renderFilterMenu() {
  const tags = getAllTags();
  const list = document.getElementById('filter-menu-list');

  if (tags.length === 0) {
    list.innerHTML = '<p class="filter-menu-empty">No tags yet</p>';
  } else {
    list.innerHTML = tags.map(tag => `
      <label class="filter-tag-item">
        <input type="checkbox" data-tag="${esc(tag)}" ${state.activeFilters.includes(tag) ? 'checked' : ''}>
        <span class="filter-tag-name">${esc(tag)}</span>
        <span class="filter-tag-count">${getTagCount(tag)}</span>
      </label>`).join('');

    list.querySelectorAll('input[type="checkbox"]').forEach(cb => {
      cb.addEventListener('change', () => {
        const tag = cb.dataset.tag;
        if (cb.checked) {
          if (!state.activeFilters.includes(tag)) state.activeFilters.push(tag);
        } else {
          state.activeFilters = state.activeFilters.filter(t => t !== tag);
        }
        updateFilterBadge();
        renderActiveChips();
        renderProductGrid();
      });
    });
  }
  updateFilterBadge();
}

function updateFilterBadge() {
  const badge = document.getElementById('filter-badge');
  const btn   = document.getElementById('filter-btn');
  const n     = state.activeFilters.length;
  badge.textContent = n;
  badge.classList.toggle('hidden', n === 0);
  btn.classList.toggle('active', n > 0);
}

function toggleFilterMenu() {
  filterMenuOpen = !filterMenuOpen;
  const menu = document.getElementById('filter-menu');
  const btn  = document.getElementById('filter-btn');
  menu.classList.toggle('hidden', !filterMenuOpen);
  btn.classList.toggle('open', filterMenuOpen);
  if (filterMenuOpen) renderFilterMenu();
}

function closeFilterMenu() {
  filterMenuOpen = false;
  document.getElementById('filter-menu').classList.add('hidden');
  document.getElementById('filter-btn').classList.remove('open');
}

/* ================================================================
   ACTIVE CHIPS
================================================================ */
function renderActiveChips() {
  const container = document.getElementById('active-chips');
  if (state.activeFilters.length === 0) { container.innerHTML = ''; return; }

  container.innerHTML = state.activeFilters.map(tag => `
    <span class="active-chip">
      ${esc(tag)}
      <button class="active-chip-x" data-tag="${esc(tag)}" aria-label="Remove filter">×</button>
    </span>`).join('');

  container.querySelectorAll('.active-chip-x').forEach(btn => {
    btn.addEventListener('click', () => {
      state.activeFilters = state.activeFilters.filter(t => t !== btn.dataset.tag);
      const cb = document.querySelector(`#filter-menu-list input[data-tag="${CSS.escape(btn.dataset.tag)}"]`);
      if (cb) cb.checked = false;
      updateFilterBadge();
      renderActiveChips();
      renderProductGrid();
    });
  });
}

/* ================================================================
   PRODUCT GRID
================================================================ */
function renderProductGrid() {
  const grid     = document.getElementById('product-grid');
  const products = getVisibleProducts();
  const total    = state.products.filter(p => !!p.archived === state.showArchived).length;
  const countEl  = document.getElementById('result-count');

  const isFiltered = state.searchQuery || state.activeFilters.length > 0;
  if (total === 0) {
    countEl.textContent = '';
  } else if (isFiltered) {
    countEl.textContent = `${products.length} of ${total} product${total !== 1 ? 's' : ''}`;
  } else {
    countEl.textContent = `${total} product${total !== 1 ? 's' : ''}`;
  }

  if (products.length === 0) {
    const icon = state.showArchived ? '🗃️' : isFiltered ? '🔍' : '📦';
    const msg  = state.showArchived
      ? 'No archived products.'
      : isFiltered
        ? 'No products match your search.'
        : 'Add your first product to get started.';

    grid.innerHTML = `
      <div class="empty-state">
        <div class="empty-ico">${icon}</div>
        <p class="empty-msg">${msg}</p>
        ${!state.showArchived && !isFiltered
          ? `<button class="btn-blk" id="empty-add-btn">
               <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
                 <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
               </svg>
               Add Product
             </button>`
          : ''}
      </div>`;
    document.getElementById('empty-add-btn')?.addEventListener('click', openAddProduct);
    return;
  }

  grid.innerHTML = products.map(renderCard).join('');

  grid.querySelectorAll('.product-card').forEach(card => {
    const id = card.dataset.id;
    card.querySelector('.card-img-wrap').addEventListener('click', () => openDetail(id));
    card.querySelector('.card-body').addEventListener('click', () => openDetail(id));
    card.querySelector('.btn-star').addEventListener('click', e => { e.stopPropagation(); toggleStar(id); });
    card.querySelector('.btn-edit').addEventListener('click', e => { e.stopPropagation(); openEditProduct(id); });
    card.querySelector('.btn-archive').addEventListener('click', e => { e.stopPropagation(); toggleArchive(id); });
    card.querySelector('.btn-delete').addEventListener('click', e => { e.stopPropagation(); confirmDeleteProduct(id); });
  });
}

function renderCard(p) {
  const sc = p.supplierTable?.rows?.length ?? 0;
  return `
    <div class="product-card${p.starred ? ' is-starred' : ''}" data-id="${p.id}">
      <div class="card-img-wrap">
        ${p.imageUrl
          ? `<img src="${esc(p.imageUrl)}" alt="${esc(p.name)}" loading="lazy" onerror="this.parentElement.innerHTML='<div class=\\'no-img\\'>📷</div>'">`
          : '<div class="no-img">📷</div>'}
        ${p.starred ? '<span class="starred-badge">★ Priority</span>' : ''}
      </div>
      <div class="card-body">
        <h3 class="card-name">${esc(p.name)}</h3>
        <div class="card-tags">${p.tags.map(t => `<span class="tag-chip-sm">${esc(t)}</span>`).join('')}</div>
        <div class="card-meta">
          <span class="card-sup-ct">${sc} supplier${sc !== 1 ? 's' : ''}${p.notes ? ' · <span class="note-dot" title="Has notes">✎</span>' : ''}</span>
          ${p.etsyUrl ? `<a href="${esc(p.etsyUrl)}" target="_blank" rel="noopener noreferrer" class="etsy-lnk" onclick="event.stopPropagation()">Etsy ↗</a>` : ''}
        </div>
      </div>
      <div class="card-actions">
        <button class="card-act-btn btn-star${p.starred ? ' is-starred' : ''}" title="${p.starred ? 'Remove priority' : 'Mark priority'}">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="${p.starred ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
          </svg>
        </button>
        <button class="card-act-btn btn-edit" title="Edit product">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
        </button>
        <button class="card-act-btn btn-archive" title="${p.archived ? 'Restore' : 'Archive'}">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            ${p.archived
              ? '<polyline points="1 6 1 22 23 22 23 6"/><polyline points="23 3 1 3"/>'
              : '<polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/>'}
          </svg>
        </button>
        <button class="card-act-btn btn-delete" title="Delete">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
            <path d="M10 11v6M14 11v6M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
          </svg>
        </button>
      </div>
    </div>`;
}

/* ================================================================
   PRODUCT CRUD
================================================================ */
function createProduct({ name, etsyUrl, imageUrl, tags, notes }) {
  return {
    id: uid(), name, etsyUrl, imageUrl, tags,
    notes: notes || '',
    starred: false, archived: false, createdAt: Date.now(),
    supplierTable: {
      columns: DEFAULT_COLS.map(n => ({ id: uid(), name: n })),
      rows: [],
    },
  };
}

function openAddProduct()    { state.editingId = null; openProductModal(null); }
function openEditProduct(id) { state.editingId = id;   openProductModal(state.products.find(p => p.id === id)); }

function openProductModal(product) {
  const isEdit = !!product;
  document.getElementById('pm-title').textContent  = isEdit ? 'Edit Product' : 'Add Product';
  document.getElementById('pm-save').textContent   = isEdit ? 'Save Changes' : 'Save Product';
  document.getElementById('pm-url').value          = product?.etsyUrl  ?? '';
  document.getElementById('pm-name').value         = product?.name     ?? '';
  document.getElementById('pm-image').value        = product?.imageUrl ?? '';
  document.getElementById('pm-notes').value        = product?.notes    ?? '';
  document.getElementById('pm-url-status').classList.add('hidden');
  updateImgPreview(product?.imageUrl ?? '');
  renderTagsInput(document.getElementById('pm-tags'), product?.tags ?? []);
  document.getElementById('product-modal').classList.remove('hidden');
  requestAnimationFrame(() => document.getElementById('pm-name').focus());
}

async function saveProduct(e) {
  e.preventDefault();
  const nameEl = document.getElementById('pm-name');
  const name   = nameEl.value.trim();
  if (!name) { nameEl.focus(); return; }

  const etsyUrl  = document.getElementById('pm-url').value.trim();
  const imageUrl = document.getElementById('pm-image').value.trim();
  const notes    = document.getElementById('pm-notes').value.trim();
  const tagsCont = document.getElementById('pm-tags');
  let tags       = getTagsFromContainer(tagsCont);
  const pending  = tagsCont.querySelector('#tag-input')?.value.trim().toLowerCase();
  if (pending && !tags.includes(pending)) tags = [...tags, pending];

  closeModal('product-modal');

  if (state.editingId) {
    await fsUpdateProduct(state.editingId, { name, etsyUrl, imageUrl, tags, notes });
  } else {
    await fsSetProduct(createProduct({ name, etsyUrl, imageUrl, tags, notes }));
  }
  // renderApp() fired by onSnapshot
}

async function toggleStar(id) {
  const p = state.products.find(x => x.id === id);
  if (p) await fsUpdateProduct(id, { starred: !p.starred });
}

async function toggleArchive(id) {
  const p = state.products.find(x => x.id === id);
  if (p) await fsUpdateProduct(id, { archived: !p.archived });
}

function confirmDeleteProduct(id) {
  const p = state.products.find(x => x.id === id);
  openConfirm(`Delete "${p?.name}"? This cannot be undone.`, async () => {
    await fsDeleteProduct(id);
  });
}

/* ================================================================
   TAGS INPUT WIDGET
================================================================ */
function renderTagsInput(container, tags) {
  container.innerHTML = `
    <div class="tags-input-wrap" id="tags-wrap">
      ${tags.map(t => `
        <span class="tag-editable" data-tag="${esc(t)}">
          ${esc(t)}
          <button type="button" class="tag-rm" aria-label="Remove ${esc(t)}">×</button>
        </span>`).join('')}
      <input type="text" id="tag-input"
        placeholder="${tags.length === 0 ? "e.g. father's day, hard to automate…" : 'Add tag…'}"
        autocomplete="off">
    </div>`;

  container.querySelectorAll('.tag-rm').forEach(btn => {
    btn.addEventListener('click', () => {
      const tag = btn.closest('[data-tag]').dataset.tag;
      renderTagsInput(container, getTagsFromContainer(container).filter(t => t !== tag));
      container.querySelector('#tag-input').focus();
    });
  });

  container.querySelector('.tags-input-wrap').addEventListener('click', e => {
    if (e.target === e.currentTarget) container.querySelector('#tag-input').focus();
  });

  const input = container.querySelector('#tag-input');
  input.addEventListener('keydown', e => {
    if ((e.key === 'Enter' || e.key === ',') && input.value.trim()) {
      e.preventDefault();
      const tag = input.value.trim().toLowerCase().replace(/,+$/, '');
      const cur = getTagsFromContainer(container);
      if (!cur.includes(tag)) { renderTagsInput(container, [...cur, tag]); }
      else { input.value = ''; }
      container.querySelector('#tag-input').focus();
    } else if (e.key === 'Backspace' && !input.value) {
      const cur = getTagsFromContainer(container);
      if (cur.length > 0) { renderTagsInput(container, cur.slice(0, -1)); container.querySelector('#tag-input').focus(); }
    }
  });
}

function getTagsFromContainer(container) {
  return [...container.querySelectorAll('[data-tag]')].map(el => el.dataset.tag);
}

/* ================================================================
   IMAGE PREVIEW
================================================================ */
function updateImgPreview(url) {
  const el = document.getElementById('pm-img-preview');
  if (!el) return;
  el.innerHTML = url ? `<img src="${esc(url)}" alt="Preview" onerror="this.parentElement.innerHTML=''">` : '';
}

/* ================================================================
   PRODUCT DETAIL
================================================================ */
function openDetail(id) {
  state.detailId = id;
  const p = state.products.find(x => x.id === id);
  if (!p) return;
  renderDetailContent(p);
  document.getElementById('detail-modal').classList.remove('hidden');
}

function renderDetailContent(p) {
  document.getElementById('detail-name').textContent = p.name;
  document.getElementById('detail-img').innerHTML = p.imageUrl
    ? `<img src="${esc(p.imageUrl)}" alt="${esc(p.name)}" onerror="this.parentElement.innerHTML='<div class=\\'no-thumb\\'>📷</div>'">`
    : '<div class="no-thumb">📷</div>';
  document.getElementById('detail-tags').innerHTML = p.tags.map(t => `<span class="tag-chip-sm">${esc(t)}</span>`).join('');
  document.getElementById('detail-link').innerHTML = p.etsyUrl
    ? `<a href="${esc(p.etsyUrl)}" target="_blank" rel="noopener noreferrer">View on Etsy ↗</a>` : '';

  // Notes section
  const notesSection = document.getElementById('detail-notes-section');
  const notesEl      = document.getElementById('detail-notes-text');
  if (p.notes && p.notes.trim()) {
    notesEl.textContent = p.notes;
    notesSection.classList.remove('hidden');
  } else {
    notesSection.classList.add('hidden');
  }

  renderSupTable(p);
}

/* ================================================================
   SUPPLIER TABLE
================================================================ */
function renderSupTable(p) {
  const container = document.getElementById('supplier-container');
  const table     = p.supplierTable;

  const badge = document.getElementById('supplier-badge');
  if (badge) badge.textContent = `${table.rows.length} supplier${table.rows.length !== 1 ? 's' : ''}`;

  container.innerHTML = `
    <div class="table-scroll">
      <table class="sup-table" id="sup-table">
        <thead>
          <tr>
            <th class="col-ctrl"></th>
            ${table.columns.map(col => `
              <th class="col-head" data-col-id="${col.id}">
                <div class="col-head-inner">
                  <span class="col-head-name" title="Double-click to rename">${esc(col.name)}</span>
                  <button type="button" class="col-del-btn" data-col-id="${col.id}" title="Delete column">×</button>
                </div>
              </th>`).join('')}
            <th class="add-col-th">
              <button type="button" class="add-col-btn" id="add-col-btn" title="Add column">+</button>
            </th>
          </tr>
        </thead>
        <tbody>
          ${table.rows.map(row => `
            <tr data-row-id="${row.id}">
              <td class="col-ctrl">
                <button type="button" class="row-del-btn" data-row-id="${row.id}" title="Delete row">×</button>
              </td>
              ${table.columns.map(col => `
                <td class="t-cell" data-row-id="${row.id}" data-col-id="${col.id}">
                  <span class="cell-text">${esc(row.cells[col.id] ?? '')}</span>
                  <input class="cell-inp hidden" type="text" value="${esc(row.cells[col.id] ?? '')}" aria-label="${esc(col.name)}">
                </td>`).join('')}
              <td></td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>
    <div class="table-foot">
      <button type="button" class="add-row-btn" id="add-row-btn">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
          <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
        Add Supplier
      </button>
    </div>`;

  attachTableEvents(container, p);
}

function attachTableEvents(container, p) {
  const table = p.supplierTable;

  container.querySelectorAll('.col-head-name').forEach(span => {
    span.addEventListener('dblclick', () => {
      const colId = span.closest('th').dataset.colId;
      const col   = table.columns.find(c => c.id === colId);
      if (!col) return;
      const inp = document.createElement('input');
      inp.type = 'text'; inp.className = 'col-rename-inp'; inp.value = col.name;
      span.replaceWith(inp); inp.focus(); inp.select();
      const commit = () => { col.name = inp.value.trim() || col.name; fsUpdateProduct(p.id, { supplierTable: table }); renderSupTable(p); };
      inp.addEventListener('blur', commit);
      inp.addEventListener('keydown', e => {
        if (e.key === 'Enter')  { e.preventDefault(); commit(); }
        if (e.key === 'Escape') renderSupTable(p);
      });
    });
  });

  container.querySelectorAll('.col-del-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (table.columns.length <= 1) return;
      openConfirm('Delete this column and all data in it?', () => {
        table.columns = table.columns.filter(c => c.id !== btn.dataset.colId);
        table.rows.forEach(r => delete r.cells[btn.dataset.colId]);
        fsUpdateProduct(p.id, { supplierTable: table }); renderSupTable(p);
      });
    });
  });

  container.querySelectorAll('.row-del-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      table.rows = table.rows.filter(r => r.id !== btn.dataset.rowId);
      fsUpdateProduct(p.id, { supplierTable: table }); renderSupTable(p);
    });
  });

  container.querySelectorAll('.t-cell').forEach(cell => {
    cell.addEventListener('click', e => {
      e.stopPropagation();
      container.querySelectorAll('.t-cell.editing').forEach(c => { if (c !== cell) commitCell(c, p); });
      if (cell.classList.contains('editing')) return;
      cell.classList.add('editing');
      const disp = cell.querySelector('.cell-text');
      const inp  = cell.querySelector('.cell-inp');
      disp.classList.add('hidden'); inp.classList.remove('hidden'); inp.focus();
      const len = inp.value.length; inp.setSelectionRange(len, len);
    });
  });

  container.querySelectorAll('.cell-inp').forEach(inp => {
    const cell = inp.closest('.t-cell');
    inp.addEventListener('blur', () => {
      setTimeout(() => { if (cell.classList.contains('editing')) commitCell(cell, p); }, 80);
    });
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault(); commitCell(cell, p);
        cell.closest('tr').nextElementSibling?.querySelector(`.t-cell[data-col-id="${cell.dataset.colId}"]`)?.click();
      }
      if (e.key === 'Escape') {
        inp.value = p.supplierTable.rows.find(r => r.id === cell.dataset.rowId)?.cells[cell.dataset.colId] ?? '';
        inp.classList.add('hidden'); cell.querySelector('.cell-text').classList.remove('hidden');
        cell.classList.remove('editing');
      }
      if (e.key === 'Tab') {
        e.preventDefault(); commitCell(cell, p);
        const all = [...cell.closest('tr').querySelectorAll('.t-cell')];
        const idx = all.indexOf(cell);
        (e.shiftKey ? all[idx - 1] : all[idx + 1])?.click();
      }
    });
  });

  document.getElementById('add-row-btn').addEventListener('click', () => {
    const row = { id: uid(), cells: {} };
    table.columns.forEach(col => { row.cells[col.id] = ''; });
    table.rows.push(row);
    fsUpdateProduct(p.id, { supplierTable: table }); renderSupTable(p);
    setTimeout(() => container.querySelector('tbody tr:last-child .t-cell')?.click(), 30);
  });

  document.getElementById('add-col-btn').addEventListener('click', () => {
    const col = { id: uid(), name: 'New Column' };
    table.columns.push(col);
    table.rows.forEach(r => { r.cells[col.id] = ''; });
    fsUpdateProduct(p.id, { supplierTable: table }); renderSupTable(p);
    setTimeout(() => {
      container.querySelector(`th[data-col-id="${col.id}"] .col-head-name`)
        ?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    }, 30);
  });
}

function commitCell(cell, p) {
  const inp  = cell.querySelector('.cell-inp');
  const disp = cell.querySelector('.cell-text');
  if (!inp || !disp) return;
  const val = inp.value;
  const row = p.supplierTable.rows.find(r => r.id === cell.dataset.rowId);
  if (row) row.cells[cell.dataset.colId] = val;
  disp.textContent = val;
  disp.classList.remove('hidden');
  inp.classList.add('hidden');
  cell.classList.remove('editing');
  fsUpdateProduct(p.id, { supplierTable: p.supplierTable }); // fire & forget
}

/* ================================================================
   CONFIRM DIALOG
================================================================ */
let _confirmCb = null;

function openConfirm(msg, onOk, opts = {}) {
  _confirmCb = onOk;
  document.getElementById('confirm-msg').textContent = msg;
  const ok = document.getElementById('confirm-ok');
  ok.textContent = opts.label ?? 'Delete';
  ok.className   = opts.isAlert ? 'btn-blk' : 'btn-danger';
  document.getElementById('confirm-cancel').classList.toggle('hidden', !!opts.isAlert);
  document.getElementById('confirm-dialog').classList.remove('hidden');
  ok.focus();
}

function closeModal(id) { document.getElementById(id)?.classList.add('hidden'); }

/* ================================================================
   TODO LIST
================================================================ */
function renderTodoList() {
  const list = document.getElementById('todo-list');
  if (todos.length === 0) {
    list.innerHTML = '<p class="todo-empty">No tasks yet. Add one above ↑</p>';
    return;
  }
  list.innerHTML = todos.map(t => `
    <div class="todo-item${t.done ? ' done' : ''}" data-id="${t.id}">
      <button type="button" class="todo-check-btn" data-id="${t.id}" aria-label="${t.done ? 'Mark incomplete' : 'Mark complete'}">
        <svg class="todo-checkmark" width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
          <polyline points="2 6 5 9 10 3"/>
        </svg>
      </button>
      <span class="todo-text">${esc(t.text)}</span>
      <button type="button" class="todo-del-btn" data-id="${t.id}" aria-label="Delete task">×</button>
    </div>`).join('');

  list.querySelectorAll('.todo-check-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const t = todos.find(x => x.id === btn.dataset.id);
      if (t) await fsUpdateTodo(t.id, { done: !t.done });
    });
  });
  list.querySelectorAll('.todo-del-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      await fsDeleteTodo(btn.dataset.id);
    });
  });
}

async function addTodo(text) {
  if (!text.trim()) return false;
  const t = { id: uid(), text: text.trim(), done: false, createdAt: Date.now() };
  await fsSetTodo(t);
  return true;
}

/* ================================================================
   AUTH
================================================================ */
function isAuthed() { return sessionStorage.getItem('etsy_db_auth') === '1'; }

/* ================================================================
   BOOTSTRAP
================================================================ */
document.addEventListener('DOMContentLoaded', () => {

  if (isAuthed()) showView('app');
  else            showView('login');

  // ── Login ──
  document.getElementById('login-form').addEventListener('submit', e => {
    e.preventDefault();
    const pw  = document.getElementById('login-password').value;
    const err = document.getElementById('login-error');
    if (doLogin(pw)) {
      err.classList.add('hidden');
      showView('app');
    } else {
      err.classList.remove('hidden');
      document.getElementById('login-password').value = '';
      document.getElementById('login-password').focus();
      const card = document.querySelector('.login-card');
      card.style.animation = 'none'; card.offsetHeight;
      card.style.animation = 'shake 0.35s ease';
    }
  });

  // ── Add product ──
  document.getElementById('add-btn').addEventListener('click', openAddProduct);

  // ── Archive toggle ──
  document.getElementById('archive-btn').addEventListener('click', () => {
    state.showArchived   = !state.showArchived;
    state.activeFilters  = [];
    state.searchQuery    = '';
    document.getElementById('search-input').value = '';
    document.getElementById('search-clear').classList.add('hidden');
    const btn   = document.getElementById('archive-btn');
    const label = document.getElementById('archive-label');
    if (state.showArchived) { btn.classList.add('active');    label.textContent = '← Active'; }
    else                    { btn.classList.remove('active'); label.textContent = 'Archived'; }
    renderApp();
  });

  // ── Logout ──
  document.getElementById('logout-btn').addEventListener('click', doLogout);

  // ── Search ──
  const searchInput = document.getElementById('search-input');
  const searchClear = document.getElementById('search-clear');
  searchInput.addEventListener('input', () => {
    state.searchQuery = searchInput.value;
    searchClear.classList.toggle('hidden', !searchInput.value);
    renderProductGrid();
  });
  searchClear.addEventListener('click', () => {
    searchInput.value = ''; state.searchQuery = '';
    searchClear.classList.add('hidden'); searchInput.focus(); renderProductGrid();
  });

  // ── Filter ──
  document.getElementById('filter-btn').addEventListener('click', e => {
    e.stopPropagation(); toggleFilterMenu();
  });
  document.getElementById('filter-clear-btn').addEventListener('click', () => {
    state.activeFilters = []; closeFilterMenu(); renderApp();
  });
  document.addEventListener('click', e => {
    if (filterMenuOpen && !document.getElementById('filter-anchor').contains(e.target)) closeFilterMenu();
  });

  // ── Product Modal ──
  document.getElementById('product-form').addEventListener('submit', saveProduct);
  document.getElementById('pm-close').addEventListener('click',  () => closeModal('product-modal'));
  document.getElementById('pm-cancel').addEventListener('click', () => closeModal('product-modal'));

  document.getElementById('pm-url').addEventListener('input', e => {
    const url = e.target.value.trim();
    if (!url.includes('etsy.com/listing/')) return;
    const name      = extractNameFromEtsyUrl(url);
    const nameField = document.getElementById('pm-name');
    if (name && (!nameField.value || nameField.dataset.autoFilled === '1')) {
      nameField.value = name; nameField.dataset.autoFilled = '1';
    }
  });

  document.getElementById('pm-extract-btn').addEventListener('click', () => {
    const url    = document.getElementById('pm-url').value.trim();
    const status = document.getElementById('pm-url-status');
    if (!url) { document.getElementById('pm-url').focus(); return; }
    const name = extractNameFromEtsyUrl(url);
    if (name) {
      document.getElementById('pm-name').value = name;
      document.getElementById('pm-name').dataset.autoFilled = '1';
      status.textContent = '✓ Name extracted from URL'; status.style.color = '#2A9D5C';
    } else {
      status.textContent = '⚠ Could not extract name — enter manually.'; status.style.color = '#CC0000';
    }
    status.classList.remove('hidden');
    setTimeout(() => status.classList.add('hidden'), 3500);
  });

  document.getElementById('pm-name').addEventListener('input', function () { delete this.dataset.autoFilled; });
  document.getElementById('pm-image').addEventListener('input', e => updateImgPreview(e.target.value.trim()));

  // ── Detail Modal ──
  document.getElementById('detail-close').addEventListener('click', () => closeModal('detail-modal'));

  // ── Confirm Dialog ──
  document.getElementById('confirm-ok').addEventListener('click', () => {
    if (_confirmCb) { _confirmCb(); _confirmCb = null; }
    closeModal('confirm-dialog');
  });
  document.getElementById('confirm-cancel').addEventListener('click', () => {
    _confirmCb = null; closeModal('confirm-dialog');
  });

  // ── Backdrop clicks ──
  document.querySelectorAll('.modal').forEach(modal => {
    modal.addEventListener('click', e => {
      if (e.target !== modal) return;
      if (modal.id === 'detail-modal') {
        document.querySelectorAll('.t-cell.editing').forEach(cell => {
          const p = state.products.find(x => x.id === state.detailId);
          if (p) commitCell(cell, p);
        });
      }
      modal.classList.add('hidden');
    });
  });

  // ── ESC ──
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if (filterMenuOpen)                                                                 { closeFilterMenu(); return; }
      if (!document.getElementById('confirm-dialog').classList.contains('hidden'))       { closeModal('confirm-dialog'); _confirmCb = null; }
      else if (!document.getElementById('detail-modal').classList.contains('hidden'))    { closeModal('detail-modal'); }
      else if (!document.getElementById('product-modal').classList.contains('hidden'))   { closeModal('product-modal'); }
      else if (document.getElementById('todo-panel').classList.contains('open'))         { closeTodoPanel(); }
    }
  });

  // ── Todo Panel ──
  const todoPanel = document.getElementById('todo-panel');
  const todoBtn   = document.getElementById('todo-btn');
  const todoClose = document.getElementById('todo-close-btn');
  const todoInput = document.getElementById('todo-input');

  function closeTodoPanel() {
    todoPanel.classList.remove('open'); todoBtn.classList.remove('active');
  }

  todoBtn.addEventListener('click', () => {
    const opening = !todoPanel.classList.contains('open');
    todoPanel.classList.toggle('open', opening);
    todoBtn.classList.toggle('active', opening);
    if (opening) { renderTodoList(); setTimeout(() => todoInput.focus(), 260); }
  });

  todoClose.addEventListener('click', closeTodoPanel);

  todoInput.addEventListener('keydown', async e => {
    if (e.key === 'Enter') { if (await addTodo(todoInput.value)) todoInput.value = ''; }
  });
});

/* Shake animation */
const _style = document.createElement('style');
_style.textContent = `@keyframes shake {
  0%,100%{transform:translateX(0)} 20%{transform:translateX(-6px)}
  40%{transform:translateX(6px)}   60%{transform:translateX(-4px)} 80%{transform:translateX(4px)}
}`;
document.head.appendChild(_style);

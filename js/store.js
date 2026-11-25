/* ============================================================
   Salvataggio sul telefono, annulla, backup.
   ============================================================ */
import { SCHEMA, emptyState, uid } from './model.js';
import { isV1, migrateV1 } from './migrate.js';

const KEY = 'svapometro.v2';
const PREV = 'svapometro.v2.prima-del-ripristino';

const listeners = [];
const undoStack = [];

export const Store = {
  state: emptyState(),

  load() {
    let raw = null;
    try { raw = localStorage.getItem(KEY); } catch (e) { }
    if (raw) {
      try { this.state = upgrade(JSON.parse(raw)); } catch (e) { console.error('[svapo] stato illeggibile', e); }
    }
    // chiede a Safari di non cancellare i dati quando lo spazio scarseggia
    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) { }
    return this.state;
  },

  save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.state));
    } catch (e) {
      alert('Memoria piena: esporta un backup.');
    }
  },

  /** esegue fn sullo stato; si può annullare. Restituisce l'azione annulla. */
  commit(label, fn) {
    const before = JSON.stringify(this.state);
    const res = fn(this.state);
    this.state.lastChange = new Date().toISOString();
    this.save();
    const entry = { label, before, at: Date.now() };
    undoStack.push(entry);
    if (undoStack.length > 30) undoStack.shift();
    emit();
    return { res, undo: () => this.undo(entry) };
  },

  undo(entry) {
    const i = undoStack.indexOf(entry);
    if (i < 0) return false;
    // si torna a prima di quell'azione: valido solo se è l'ultima
    if (i !== undoStack.length - 1) return false;
    undoStack.pop();
    this.state = JSON.parse(entry.before);
    this.save();
    emit();
    return true;
  },

  subscribe(fn) { listeners.push(fn); },

  /* ---- prodotti ed eventi ---- */
  product(id) { return this.state.products.find(p => p.id === id); },
  event(id) { return this.state.events.find(e => e.id === id); },
  addEvent(st, e) { e.id = e.id || uid(); st.events.push(e); return e; },
  removeEvent(st, id) { st.events = st.events.filter(e => e.id !== id); },
  addProduct(st, p) { p.id = p.id || uid(); st.products.push(p); return p; },

  /* ---- backup ---- */
  exportJson() {
    return JSON.stringify({ app: 'svapometro', schema: SCHEMA, exported: new Date().toISOString(), data: this.state }, null, 1);
  },

  /** legge un file di backup (v1 o v2). Restituisce lo stato nuovo senza applicarlo. */
  parseBackup(text) {
    const o = JSON.parse(text);
    if (isV1(o)) return { state: migrateV1(o), from: 'v1' };
    const d = o && o.data ? o.data : o;
    if (!d || d.schema !== SCHEMA || !Array.isArray(d.events)) throw new Error('Non è un backup di Svapometro');
    return { state: upgrade(d), from: 'v2' };
  },

  replace(st) {
    try { localStorage.setItem(PREV, JSON.stringify(this.state)); } catch (e) { }
    this.state = st;
    undoStack.length = 0;
    this.save();
    emit();
  },

  hasPrevious() { try { return !!localStorage.getItem(PREV); } catch (e) { return false; } },
  restorePrevious() {
    const raw = localStorage.getItem(PREV);
    if (!raw) return false;
    const cur = JSON.stringify(this.state);
    this.state = upgrade(JSON.parse(raw));
    localStorage.setItem(PREV, cur);
    this.save();
    emit();
    return true;
  }
};

function emit() { for (const f of listeners) { try { f(); } catch (e) { console.error(e); } } }

/** completa con i valori predefiniti quello che manca (versioni future: migrazioni qui) */
function upgrade(st) {
  const base = emptyState();
  const out = Object.assign({}, base, st);
  out.settings = Object.assign({}, base.settings, st.settings || {});
  for (const k of ['iqos', 'device', 'coil']) out.settings[k] = Object.assign({}, base.settings[k], (st.settings || {})[k] || {});
  out.products = st.products || [];
  out.events = st.events || [];
  out.review = st.review || [];
  out.schema = SCHEMA;
  return out;
}

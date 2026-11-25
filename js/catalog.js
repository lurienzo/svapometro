/* ============================================================
   Catalogo (marca -> linea -> liquido) e ricerca unica:
   prima i tuoi prodotti, poi il catalogo.
   ============================================================ */
import { fullName } from './model.js';

export const FMT = {
  P: { n: 'Pronto', kind: 'pronto' },
  M: { n: 'Mini shot', kind: 'shot' },
  S: { n: 'Shot', kind: 'shot' },
  A: { n: 'Aroma', kind: 'aroma' },
  N: { n: 'Basetta', kind: 'basetta' },
  B: { n: 'Base', kind: 'base' }
};

export function norm(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ').trim();
}

export function fmtLabel(f) {
  const [t, ml, cap] = f;
  if (t === 'M' || t === 'S') return FMT[t].n + ' ' + ml + (cap ? '+' + (cap - ml) : '');
  if (t === 'B') return 'Base ' + ml + ' ml';
  return FMT[t].n + ' ' + ml + ' ml';
}

export const Catalog = {
  ready: false,
  brands: [], items: [], coils: [], hay: [],
  _p: null,

  load() {
    if (this._p) return this._p;
    this._p = fetch('data/catalogo.json').then(r => r.json()).then(d => {
      this.brands = d.brands;
      this.coils = d.coils || [];
      this.items = d.items.map((r, i) => ({
        i, brand: d.brands[r[0]], line: r[1], name: r[2], fam: r[3], note: r[4], desc: r[5], fmts: r[6]
      }));
      this.hay = this.items.map(it => norm(it.brand + ' ' + it.line + ' ' + it.name + ' ' + it.note));
      this.ready = true;
      return this;
    }).catch(e => { console.error('[svapo] catalogo', e); this._p = null; throw e; });
    return this._p;
  },

  search(q, limit) {
    const terms = norm(q).split(' ').filter(Boolean);
    if (!terms.length) return [];
    const out = [];
    for (let i = 0; i < this.items.length; i++) {
      const h = this.hay[i];
      let ok = true;
      for (const t of terms) if (h.indexOf(t) < 0) { ok = false; break; }
      if (!ok) continue;
      const it = this.items[i];
      const nn = norm(it.name), nl = norm(it.line + ' ' + it.name);
      const full = terms.join(' ');
      let score = 0;
      if (nn === full || nl === full) score += 100;
      if (nn.startsWith(terms[0]) || nl.startsWith(full)) score += 30;
      if (norm(it.brand).startsWith(terms[0])) score += 10;
      score -= it.name.length / 20;
      out.push([score, it]);
    }
    out.sort((a, b) => b[0] - a[0]);
    return out.slice(0, limit || 40).map(x => x[1]);
  },

  byBrand(brand) {
    return this.items.filter(it => it.brand === brand);
  }
};

/** i tuoi prodotti che corrispondono alla ricerca (tutti, anche finiti) */
export function searchMine(products, q) {
  const terms = norm(q).split(' ').filter(Boolean);
  if (!terms.length) return [];
  return products.filter(p => {
    if (p.archived) return false;
    const h = norm(p.brand + ' ' + p.line + ' ' + p.name + ' ' + (p.kind || ''));
    return terms.every(t => h.indexOf(t) >= 0);
  });
}

/** suggerisce l'elemento di catalogo per un prodotto tuo (per collegarlo): solo se il nome coincide */
export function guessCatalog(p) {
  if (!Catalog.ready) return null;
  const nn = norm(p.name), nb = norm(p.brand);
  const same = it => {
    const a = norm(it.name), b = norm(it.line + ' ' + it.name);
    return a === nn || b === nn || (nn.length > 4 && (b.endsWith(nn) || nn.endsWith(a)));
  };
  const toks = s => norm(s).split(' ').filter(w => w.length >= 3);
  const mine = toks(p.brand);
  const brandOk = it => !mine.length || toks(it.brand).some(w => mine.indexOf(w) >= 0);
  const res = Catalog.search(p.name, 200).filter(it => same(it) && brandOk(it));
  if (res.length === 1 || (res.length > 1 && nb)) return res[0];
  return null;
}

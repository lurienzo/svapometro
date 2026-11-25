/* ============================================================
   Le schede: Oggi · Scorta · Diario · Numeri, più scheda prodotto e impostazioni.
   ============================================================ */
import { KINDS, fullName, dayOf, monthOf, parseStamp, localStamp } from './model.js';
import { analyze, bottlesOf, stockByProduct, mlByMonth, mlByDay, monthsBack } from './calc.js';
import { Store } from './store.js';
import { Catalog, fmtLabel, guessCatalog } from './catalog.js';
import * as F from './flows.js';
import { $, $$, esc, fmt, fdate, parseNum, dec, toast, Sheet, haptic, levelBar, bottleIcon, bars, confirmSheet, on } from './ui.js';

export const VOTES = {
  amato: { n: 'Amato', e: '😍' }, piaciuto: { n: 'Piaciuto', e: '🙂' }, ni: { n: 'Nì', e: '😐' }, odiato: { n: 'No', e: '🙅' }
};

/* ============================================================ OGGI */
export const Home = {
  title: 'Oggi',
  sub() { return fdate.long(localStamp()); },
  actions() { return '<button class="tb-btn" data-nav="settings" aria-label="Impostazioni">⚙︎</button>'; },
  render() {
    const A = analyze(Store.state);
    const S = Store.state.settings;
    let h = '';

    if (!Store.state.events.length && !Store.state.products.length) {
      return '<div class="empty"><div class="ico">💨</div><h3>Benvenuto</h3><p>Se hai il backup della vecchia app, importalo: converto tutto io.</p>' +
        '<div class="gap"></div>' + importButton('Importa backup', 'primary') +
        '<div class="gap"></div><button class="btn" data-nav="settings">Parto da zero: impostazioni</button></div>';
    }

    // tre azioni, sempre in cima
    h += '<div class="actions">' +
      '<button class="act primary" data-a="refill"><span class="ai">💧</span>Rabbocco</button>' +
      '<button class="act" data-a="buy"><span class="ai">🛒</span>Ho comprato</button>' +
      '<button class="act" data-a="coil"><span class="ai">🌀</span>Cambio coil</button></div>';

    // da sistemare
    const rv = Store.state.review.filter(r => r.kind === 'ask');
    if (rv.length) {
      h += '<button class="card tight" data-a="review" style="width:100%;text-align:left;border:1px solid rgba(240,195,58,.35)">' +
        '<div class="spread"><b>⚠️ ' + rv.length + ' cose da sistemare</b><span class="chev">›</span></div>' +
        '<div class="small muted">Dati della vecchia app che non posso decidere da solo</div></button>';
    }

    // risparmio
    if (S.switchDate) {
      h += '<div class="card hi"><div class="spread"><div><div class="small muted">Risparmiati rispetto alle IQOS</div>' +
        '<div class="big num ' + (A.savings >= 0 ? 'amber' : 'bad') + '" id="live-sav">' + fmt.eur(A.savings) + '</div></div>' +
        '<div style="text-align:right"><div class="mid num">' + fmt.n(A.sticks, 0) + '</div><div class="tiny faint">TEREA non fumate</div></div></div>' +
        '<div class="small faint" style="margin-top:8px">' + fmt.n(A.daysOff, 0) + ' giorni · IQOS ' + fmt.eur0(A.iqosCost) + ' − svapo ' + fmt.eur0(A.spent) + ' (tutto compreso)</div></div>';
    }

    // coil
    if (A.coil) {
      const c = A.coil;
      const cls = c.pct >= 100 ? 'bad' : c.pct >= 80 ? 'warn' : 'amber';
      h += '<button class="card" data-a="coil" style="width:100%;text-align:left"><div class="spread"><h3 style="margin:0">Coil</h3>' +
        '<span class="small ' + (c.pct >= 100 ? 'bad' : 'faint') + '">' + esc(c.unit.model) + ' · ' + fmt.n1(c.unit.watt) + ' W</span></div>' +
        '<div class="spread" style="margin:8px 0 8px"><span class="mid num">' + fmt.pct(c.pct) + '</span>' +
        '<span class="small muted">' + fmt.ml(c.ml) + ' su ' + fmt.ml(c.lifeMl) + ' · ' + fdate.days(c.days) + '</span></div>' +
        '<div class="bar thick ' + cls + '"><i style="width:' + Math.min(100, c.pct) + '%"></i></div>' +
        '<div class="small faint" style="margin-top:8px">' +
        (c.pct >= 100 ? 'È ora di cambiarla' : c.leftDays != null ? 'Ancora ' + fdate.days(c.leftDays) + ' circa' : '') +
        ' · ' + (A.coilSpare.length ? A.coilSpare.length + ' di scorta' : '<span class="warn">nessuna di scorta</span>') + '</div></button>';
    }

    // nel pod: l'ultima boccetta usata
    const lastRef = [...A.D.uses].reverse().find(u => u.kind === 'refill' && u.bid);
    if (lastRef) {
      const b = A.D.bottles.find(x => x.id === lastRef.bid);
      const p = A.D.prod.get(b.pid);
      h += '<button class="card tight" data-nav="product" data-pid="' + p.id + '" style="width:100%;text-align:left"><div class="bottle">' + bottleIcon(b.left, b.ml) +
        '<div style="flex:1;min-width:0"><div class="small faint">Ultimo rabbocco · ' + fdate.ago(lastRef.at) + '</div>' +
        '<div style="font-weight:650">' + esc(fullName(p)) + '</div>' +
        '<div class="small muted">' + (b.left > 0.05 ? 'nella boccetta ' + fmt.ml(b.left) + ' di ' + fmt.ml(b.ml) : 'boccetta finita') + '</div></div><span class="chev">›</span></div></button>';
    }

    // ritmo
    h += '<div class="grid3" style="margin-bottom:12px">' +
      stat(A.mlDay != null ? fmt.n1(A.mlDay) + ' ml' : '—', 'al giorno') +
      stat(A.mgDay != null ? fmt.n(A.mgDay, 0) + ' mg' : '—', 'nicotina/giorno') +
      stat(A.stockDays != null ? fdate.days(A.stockDays) : '—', 'di scorta') + '</div>';
    if (A.sparse && A.mlDay != null) {
      h += '<div class="note" style="margin-bottom:12px">Negli ultimi 30 giorni hai registrato ' + A.recentN + ' rabbocchi: per la media uso tutto lo svapato da quando hai iniziato. Più rabbocchi segni, più il numero è preciso.</div>';
    }

    // da ricomprare
    const low = lowStock(A);
    if (low.length) {
      h += '<div class="sec">Da ricomprare</div><div class="list">' + low.map(x =>
        '<button class="li" data-a="rebuy" data-pid="' + x.p.id + '"><div class="ic">' + F.kindIcon(x.p.kind) + '</div><div class="tx"><div class="t">' + esc(fullName(x.p)) +
        '</div><div class="s">' + esc(x.why) + '</div></div><span class="chip" style="min-height:32px">＋</span></button>').join('') + '</div>';
    }
    return h;
  },
  mount(root) {
    const A = analyze(Store.state);
    // il risparmio cresce mentre guardi
    const el = $('#live-sav', root);
    if (el && A.iqosDay) {
      const spentRate = 0;   // le spese sono a scatti, non al secondo
      const t0 = Date.now(), base = A.savings;
      Timers.every(1000, () => { el.textContent = fmt.eur(base + (Date.now() - t0) / 86400000 * (A.iqosDay - spentRate)); });
    }
    on(root, {
      refill: () => F.refill(), buy: () => F.buy(), coil: () => F.coilChange(),
      review: () => reviewSheet(),
      rebuy: t => F.buy({ pid: t.dataset.pid })
    });
  }
};

function stat(v, k) { return '<div class="stat"><div class="v num">' + v + '</div><div class="k">' + k + '</div></div>'; }

/** cosa sta finendo: liquidi che ami/ti piacciono quasi finiti, coil di scorta, basette */
function lowStock(A) {
  const out = [];
  const stock = stockByProduct(A.D);
  const days = ml => (A.mlDay ? ml / A.mlDay : null);
  if (A.stockDays != null && A.stockDays < 7) {
    for (const p of Store.state.products) {
      if (!KINDS[p.kind] || !KINDS[p.kind].vape || p.archived) continue;
      if (stock.has(p.id)) continue;
      if (p.rating === 'amato' || p.rating === 'piaciuto') out.push({ p, why: 'finito · ' + VOTES[p.rating].n.toLowerCase() });
    }
  }
  if (A.coil && A.coilSpare.length === 0 && A.coil.pct > 50) {
    const cp = Store.state.products.find(p => p.kind === 'coil');
    if (cp) out.unshift({ p: cp, why: 'nessuna coil di scorta, quella montata è al ' + fmt.pct(A.coil.pct) });
  }
  return out.slice(0, 5);
}

/* ============================================================ SCORTA */
let stockTab = 'vape';
export const Stock = {
  title: 'Scorta',
  sub() { const A = analyze(Store.state); return fmt.ml(A.stockMl) + ' da svapare · ≈ ' + fmt.eur0(A.stockValue) + ' già pagati'; },
  actions() { return '<button class="tb-btn accent" data-a="buy" aria-label="Ho comprato">＋</button>'; },
  render() {
    const A = analyze(Store.state);
    const stock = stockByProduct(A.D);
    const P = Store.state.products.filter(p => !p.archived);
    const tabs = [['vape', 'Da svapare'], ['diy', 'Fai da te'], ['coil', 'Coil'], ['done', 'Finiti']];
    let h = '<div class="seg">' + tabs.map(([k, n]) => '<button data-a="tab" data-k="' + k + '" class="' + (stockTab === k ? 'on' : '') + '">' + n + '</button>').join('') + '</div>';

    if (stockTab === 'coil') {
      const groups = {};
      for (const u of A.coilSpare) (groups[u.model] = groups[u.model] || []).push(u);
      h += A.coil ? '<div class="card tight"><div class="spread"><b>Montata: ' + esc(A.coil.unit.model) + '</b><span class="amber num">' + fmt.pct(A.coil.pct) + '</span></div>' +
        '<div class="small faint">dal ' + fdate.day(A.coil.unit.mountedAt) + ' · ' + fmt.ml(A.coil.ml) + '</div></div>' : '';
      h += '<div class="sec">Di scorta <button data-a="buycoil">＋ Comprate</button></div>';
      h += Object.keys(groups).length ? '<div class="list">' + Object.keys(groups).map(m =>
        '<div class="li"><div class="ic">🌀</div><div class="tx"><div class="t">' + esc(m) + '</div><div class="s">pagate in media ' + fmt.eur(groups[m].reduce((a, u) => a + u.cost, 0) / groups[m].length) + '</div></div><div class="r mid">' + groups[m].length + '</div></div>').join('') + '</div>'
        : '<div class="empty"><p>Nessuna coil di scorta.</p></div>';
      const done = A.coilDone.slice().reverse();
      if (done.length) {
        h += '<div class="sec">Storico</div><div class="list">' + done.map(u => {
          const d = (parseStamp(u.removedAt) - parseStamp(u.mountedAt)) / 86400000;
          return '<button class="li" data-a="ev" data-id="' + u.mountEv + '"><div class="tx"><div class="t">' + fdate.day(u.mountedAt) + ' → ' + fdate.day(u.removedAt) + '</div>' +
            '<div class="s">' + esc(u.model) + ' · ' + fmt.n1(u.watt) + ' W</div></div><div class="r"><div class="t num">' + fmt.ml(u.ml) + '</div><div class="s">' + fdate.days(d) + '</div></div></button>';
        }).join('') + '</div>';
      }
      return h;
    }

    let list;
    if (stockTab === 'vape') list = P.filter(p => KINDS[p.kind] && KINDS[p.kind].vape && stock.has(p.id));
    else if (stockTab === 'diy') list = P.filter(p => ['aroma', 'basetta', 'base'].includes(p.kind) && stock.has(p.id));
    else list = P.filter(p => KINDS[p.kind] && KINDS[p.kind].bottle && !stock.has(p.id));
    list.sort((a, b) => {
      const sa = stock.get(a.id), sb = stock.get(b.id);
      if (stockTab === 'done') return (a.name < b.name ? -1 : 1);
      return ((sb && sb.open) - (sa && sa.open)) || ((sb ? sb.ml : 0) - (sa ? sa.ml : 0));
    });
    if (!list.length) {
      return h + '<div class="empty"><div class="ico">🫙</div><p>' + (stockTab === 'done' ? 'Nessun liquido finito.' : 'Qui non c\'è niente.') + '</p>' +
        (stockTab !== 'done' ? '<div class="gap"></div><button class="btn primary" data-a="buy">Ho comprato</button>' : '') + '</div>';
    }
    h += '<div class="list">' + list.map(p => {
      const s = stock.get(p.id);
      const open = bottlesOf(A.D, p.id)[0];
      const meta = [p.brand, p.mg != null && p.kind !== 'aroma' ? fmt.n1(p.mg) + ' mg' : '', p.rating ? VOTES[p.rating].e : ''].filter(Boolean).join(' · ');
      return '<button class="li" data-nav="product" data-pid="' + p.id + '"><div class="bottle">' + (open ? bottleIcon(open.left, open.ml) : '') + '</div>' +
        '<div class="tx"><div class="t">' + esc(fullName(p)) + '</div><div class="s">' + esc(meta || KINDS[p.kind].short) + '</div></div>' +
        '<div class="r">' + (s ? '<div class="t amber num">' + fmt.ml(s.ml) + '</div><div class="s">' + s.n + ' bocc.</div>' : '<span class="small faint">finito</span>') + '</div></button>';
    }).join('') + '</div>';
    return h;
  },
  mount(root) {
    on(root, {
      tab: t => { stockTab = t.dataset.k; haptic(); App.refresh(); },
      buy: () => F.buy(), buycoil: () => F.buyCoil(), ev: t => F.editEvent(t.dataset.id)
    });
  },
  actionsMount(root) { on(root, { buy: () => F.buy() }); }
};

/* ============================================================ SCHEDA PRODOTTO */
export function ProductView(pid) {
  return {
    title() { const p = Store.product(pid); return p ? fullName(p) : 'Prodotto'; },
    sub() { const p = Store.product(pid); return p ? [p.brand, p.line && fullName(p) !== p.name ? '' : p.line, KINDS[p.kind] ? KINDS[p.kind].n : ''].filter(Boolean).join(' · ') : ''; },
    render() {
      const p = Store.product(pid);
      if (!p) return '<div class="empty"><p>Prodotto eliminato.</p></div>';
      const A = analyze(Store.state);
      const bs = bottlesOf(A.D, pid);
      const live = bs.filter(b => b.left > 0.05);
      const vape = KINDS[p.kind] && KINDS[p.kind].vape;
      let h = '';
      h += '<div class="btn-row" style="margin-bottom:12px">' +
        (vape && live.length ? '<button class="btn primary" data-a="refill">💧 Rabbocca</button>' : '') +
        (KINDS[p.kind].bottle ? '<button class="btn" data-a="rebuy">🛒 Ricompra</button>' : '') + '</div>';

      if (KINDS[p.kind].bottle) {
        h += '<div class="sec">Boccette</div>';
        h += live.length ? '<div class="list">' + live.map(b =>
          '<button class="li" data-a="level" data-bid="' + b.id + '"><div class="bottle">' + bottleIcon(b.left, b.ml) + '</div>' +
          '<div class="tx"><div class="t num">' + fmt.ml(b.left) + ' <span class="faint small">di ' + fmt.ml(b.ml) + '</span></div>' +
          '<div class="s">' + (b.left < b.ml - 0.05 ? 'aperta' : 'piena') + ' · comprata ' + fdate.day(b.at) + (b.mg != null ? ' · ' + fmt.n1(b.mg) + ' mg' : '') + '</div>' +
          levelBar(b.left, b.ml) + '</div><span class="small amber">livello</span></button>').join('') + '</div>'
          : '<div class="note">Nessuna boccetta piena. Ne hai finite ' + bs.length + '.</div>';
      }

      // giudizio: lo dai tu
      if (vape || p.kind === 'aroma') {
        h += '<div class="sec">Il tuo voto</div><div class="stars">' + Object.entries(VOTES).map(([k, v]) =>
          '<button class="vote' + (p.rating === k ? ' on' : '') + '" data-a="vote" data-k="' + k + '"><b>' + v.e + '</b>' + v.n + '</button>').join('') + '</div>';
        h += '<div class="field" style="margin-top:12px"><label>Note</label><textarea class="inp" id="p-notes" placeholder="Com\'è? Gola, dolcezza, coil…">' + esc(p.notes || '') + '</textarea></div>';
      }

      // numeri
      const buys = Store.state.events.filter(e => e.t === 'buy' && e.pid === pid).sort((a, b) => (a.at < b.at ? 1 : -1));
      const spent = buys.reduce((a, e) => a + (+e.price || 0), 0);
      const vapedMl = A.D.uses.filter(u => u.pid === pid && u.vaped).reduce((a, u) => a + u.ml, 0);
      h += '<div class="card tight" style="margin-top:6px">' +
        kv('Comprato', buys.reduce((a, e) => a + (+e.qty || 1), 0) + ' volte · ' + fmt.eur(spent)) +
        (vape ? kv('Svapato', fmt.ml(vapedMl)) : '') +
        (vapedMl > 0 && spent > 0 ? kv('Costo al ml', fmt.eur(spent / buys.reduce((a, e) => a + (+e.qty || 1) * (+e.mlEach || 0), 0))) : '') +
        (p.mg != null ? kv('Nicotina', fmt.n1(p.mg) + ' mg/ml') : '') + '</div>';

      // dal catalogo
      if (p.catRef != null && Catalog.ready && Catalog.items[p.catRef]) {
        const it = Catalog.items[p.catRef];
        h += '<div class="card tight"><div class="small faint">Dal catalogo</div><div style="font-weight:650">' + esc(it.brand + (it.line ? ' · ' + it.line : '') + ' · ' + it.name) + '</div>' +
          (it.note ? '<div class="small muted">' + esc(it.note) + '</div>' : '') + (it.desc ? '<div class="small faint" style="margin-top:4px">' + esc(it.desc) + '</div>' : '') +
          '<div>' + it.fmts.map(f => '<span class="fmt">' + esc(fmtLabel(f)) + (f[3] ? ' · ' + fmt.eur(f[3]) : '') + '</span>').join('') + '</div></div>';
      } else if (p.catRef == null && KINDS[p.kind].bottle) {
        h += '<div id="p-guess"></div>';
      }

      if (buys.length) {
        h += '<div class="sec">Acquisti</div><div class="list">' + buys.map(e =>
          '<button class="li" data-a="ev" data-id="' + e.id + '"><div class="tx"><div class="t">' + fdate.day(e.at) + '</div><div class="s">' + e.qty + ' × ' + fmt.ml(e.mlEach) + (e.review ? ' · <span class="warn">da controllare</span>' : '') + '</div></div>' +
          '<div class="r num">' + (+e.price > 0 ? fmt.eur(e.price) : '<span class="faint">0 €</span>') + '</div></button>').join('') + '</div>';
      }
      h += '<button class="btn ghost full" data-a="edit">Modifica nome e dati</button>';
      return h;
    },
    mount(root) {
      const p = Store.product(pid);
      if (!p) return;
      const notes = $('#p-notes', root);
      if (notes) notes.addEventListener('change', () => { Store.commit('Note', st => { st.products.find(x => x.id === pid).notes = notes.value.trim(); }); toast('Note salvate', 'ok'); });
      const g = $('#p-guess', root);
      if (g) Catalog.load().then(() => {
        const it = guessCatalog(p);
        if (!it) return;
        g.innerHTML = '<div class="card tight"><div class="small faint">È questo nel catalogo?</div><div style="font-weight:650">' + esc(it.brand + (it.line ? ' · ' + it.line : '') + ' · ' + it.name) + '</div>' +
          (it.note ? '<div class="small muted">' + esc(it.note) + '</div>' : '') +
          '<div class="btn-row" style="margin-top:10px"><button class="btn small" data-a="link" data-i="' + it.i + '">Sì, collega</button></div></div>';
      }).catch(() => { });
      on(root, {
        refill: () => F.refill(pid), rebuy: () => F.buy({ pid }), level: t => F.level(t.dataset.bid), ev: t => F.editEvent(t.dataset.id),
        vote: t => { haptic(); Store.commit('Voto', st => { const x = st.products.find(y => y.id === pid); x.rating = x.rating === t.dataset.k ? null : t.dataset.k; }); },
        link: t => { const it = Catalog.items[+t.dataset.i]; Store.commit('Collega', st => { const x = st.products.find(y => y.id === pid); x.catRef = it.i; if (!x.brand) x.brand = it.brand; if (!x.line) x.line = it.line; x.fam = it.fam; }); toast('Collegato al catalogo', 'ok'); },
        edit: () => editProduct(pid)
      });
    }
  };
}

function kv(k, v) { return '<div class="kv"><span class="k">' + k + '</span><span class="v">' + v + '</span></div>'; }

function editProduct(pid) {
  const p = Store.product(pid);
  Sheet.open({
    title: 'Modifica', sub: fullName(p),
    body:
      '<div class="field"><label>Nome</label><input class="inp" id="m-name" value="' + esc(p.name) + '"></div>' +
      '<div class="grid2"><div class="field"><label>Marca</label><input class="inp" id="m-brand" value="' + esc(p.brand) + '"></div>' +
      '<div class="field"><label>Linea</label><input class="inp" id="m-line" value="' + esc(p.line || '') + '"></div></div>' +
      '<div class="field"><label>Tipo</label><div class="chips wrap">' + Object.keys(KINDS).filter(k => k !== 'altro').map(k =>
        '<button class="chip' + (p.kind === k ? ' on' : '') + '" data-k="' + k + '">' + F.kindIcon(k) + ' ' + KINDS[k].short + '</button>').join('') + '</div></div>' +
      '<div class="field"><label>Nicotina (mg/ml)</label><input class="inp num" id="m-mg" inputmode="decimal" value="' + esc(dec(p.mg)) + '" placeholder="—"></div>',
    foot: '<div class="btn-row"><button class="btn danger" data-x="arch">' + (p.archived ? 'Ripristina' : 'Nascondi') + '</button><button class="btn primary" data-x="ok">Salva</button></div>',
    mount(sh) {
      let kind = p.kind;
      sh.addEventListener('click', e => { const c = e.target.closest('[data-k]'); if (!c) return; kind = c.dataset.k; $$('[data-k]', sh).forEach(x => x.classList.toggle('on', x === c)); });
      $('[data-x=ok]', sh).onclick = () => {
        const { undo } = Store.commit('Prodotto', st => {
          const x = st.products.find(y => y.id === pid);
          x.name = $('#m-name', sh).value.trim() || x.name; x.brand = $('#m-brand', sh).value.trim(); x.line = $('#m-line', sh).value.trim();
          x.kind = kind; const mg = $('#m-mg', sh).value.trim(); x.mg = mg === '' ? null : parseNum(mg);
        });
        Sheet.close(); toast('Salvato', 'ok', undo);
      };
      $('[data-x=arch]', sh).onclick = () => {
        const { undo } = Store.commit('Nascondi', st => { const x = st.products.find(y => y.id === pid); x.archived = !x.archived; });
        Sheet.close(); toast(p.archived ? 'Ripristinato' : 'Nascosto dagli elenchi (i dati restano)', 'ok', undo);
      };
    }
  });
}

/* ============================================================ DIARIO */
export const Diary = {
  title: 'Diario',
  sub() { return 'Tutto quello che hai registrato · tocca per correggere'; },
  render() {
    const A = analyze(Store.state);
    const D = A.D;
    const evs = Store.state.events.slice().sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
    if (!evs.length) return '<div class="empty"><div class="ico">📓</div><p>Ancora niente.</p></div>';
    const bottlePid = new Map(D.bottles.map(b => [b.id, b.pid]));
    let h = '', day = '';
    // i rabbocchi divisi su due boccette nello stesso minuto si mostrano insieme
    for (const e of evs.slice(0, 300)) {
      const d = dayOf(e.at);
      if (d !== day) {
        day = d;
        const ml = D.uses.filter(u => u.kind === 'refill' && dayOf(u.at) === d).reduce((a, u) => a + u.ml, 0);
        h += (h ? '</div>' : '') + '<div class="day-h spread"><span>' + esc(fdate.long(d)) + '</span>' + (ml ? '<span class="amber num">' + fmt.ml(ml) + '</span>' : '') + '</div><div class="list">';
      }
      h += evRow(e, D, bottlePid);
    }
    return h + '</div>';
  },
  mount(root) { on(root, { ev: t => F.editEvent(t.dataset.id) }); }
};

function evRow(e, D, bottlePid) {
  const pName = pid => { const p = D.prod.get(pid); return p ? fullName(p) : '—'; };
  let ic = '•', t = '', s = '', r = '';
  if (e.t === 'refill') { ic = '💧'; t = e.bid ? pName(bottlePid.get(e.bid)) : 'Rabbocco senza boccetta'; r = fmt.ml(e.ml); s = 'rabbocco'; }
  if (e.t === 'buy') { const p = D.prod.get(e.pid); ic = p && p.kind === 'coil' ? '🌀' : '🛒'; t = pName(e.pid); s = 'acquisto · ' + e.qty + ' × ' + (p && p.kind === 'coil' ? 'coil' : fmt.ml(e.mlEach)); r = +e.price > 0 ? fmt.eur(e.price) : '0 €'; }
  if (e.t === 'coil') { ic = '🌀'; t = 'Coil montata'; s = (e.model || '') + ' · ' + fmt.n1(e.watt) + ' W'; }
  if (e.t === 'level') { ic = '📏'; t = pName(bottlePid.get(e.bid)); s = e.left <= 0.05 ? 'finita' : 'livello: ' + fmt.ml(e.left); }
  if (e.t === 'spend') { ic = '🧾'; t = e.label || e.cat; s = e.cat + (e.review ? ' · da sistemare' : ''); r = fmt.eur(e.amount); }
  if (e.est) s += ' · stima';
  return '<button class="li" data-a="ev" data-id="' + e.id + '"><div class="ic">' + ic + '</div><div class="tx"><div class="t">' + esc(t) + '</div>' +
    '<div class="s">' + esc(s) + ' · ' + fdate.time(e.at) + '</div></div><div class="r num">' + r + '</div></button>';
}

/* ============================================================ NUMERI */
export const Stats = {
  title: 'Numeri',
  sub() { return 'Calcolati da quello che hai registrato'; },
  render() {
    const A = analyze(Store.state);
    const now = new Date();
    let h = '';
    // spesa per mese
    const months = monthsBack(6, now).map(ym => ({ ym, v: A.byMonth[ym] || 0, label: fdate.monthShort(ym) }));
    h += '<div class="card"><h3>Spesa al mese</h3>' + bars(months, { f: v => fmt.n(v, 0) }) +
      '<div class="hr"></div>' +
      kv('Totale dall\'inizio', fmt.eur(A.spent)) +
      kv('di cui hardware (una volta sola)', fmt.eur(A.oneOff)) +
      (A.monthPace != null ? kv('Ritmo attuale (ultimi 30 gg)', fmt.eur0(A.monthPace) + ' / mese') : '') +
      kv('IQOS allo stesso ritmo', fmt.eur0(A.iqosDay * 30.44) + ' / mese') + '</div>';

    // per categoria
    const cats = Object.entries(A.byCat).sort((a, b) => b[1] - a[1]);
    if (cats.length) h += '<div class="card"><h3>Dove vanno i soldi</h3>' + cats.map(([c, v]) =>
      '<div class="kv"><span class="k">' + esc(c) + '</span><span class="v">' + fmt.eur(v) + ' <span class="faint small">' + fmt.pct(v / A.spent * 100) + '</span></span></div>').join('') + '</div>';

    // consumo
    const days = mlByDay(A.D, 30, now);
    const mx = Math.max(1, ...days.map(d => d.v));
    h += '<div class="card"><h3>Consumo · ultimi 30 giorni</h3><div class="mini-bars">' +
      days.map((d, i) => '<i class="' + (i === days.length - 1 ? 'hl' : '') + '" style="height:' + (d.v / mx * 100) + '%"></i>').join('') + '</div>' +
      '<div class="hr"></div>' +
      kv('Media che uso', A.mlDay != null ? fmt.n1(A.mlDay) + ' ml/giorno' : '—') +
      kv('Dai rabbocchi segnati (30 gg)', A.ml30 != null ? fmt.n1(A.ml30) + ' ml/giorno' : '—') +
      kv('Da tutto lo svapato', A.mlDayAll != null ? fmt.n1(A.mlDayAll) + ' ml/giorno' : '—') +
      kv('Svapato in totale', fmt.ml(A.mlTotal)) +
      (A.mgAvg != null ? kv('Nicotina media', fmt.n1(A.mgAvg) + ' mg/ml · ' + fmt.n(A.mgDay, 0) + ' mg/giorno') : '') +
      (A.eurMl != null ? kv('Costo vero del liquido svapato', fmt.eur(A.eurMl) + ' / ml') : '') + '</div>';

    // coil
    h += '<div class="card"><h3>Coil</h3>' +
      kv('Finite', A.coilDone.length) +
      (A.coilAvgMl != null ? kv('Durata media', fmt.ml(A.coilAvgMl) + ' · ' + fdate.days(A.coilAvgDays)) : '') +
      kv('Di scorta', A.coilSpare.length + (A.coilStockDays != null && A.coilSpare.length ? ' · circa ' + fdate.days(A.coilStockDays) : '')) + '</div>';

    // scorta
    h += '<div class="card"><h3>Scorta</h3>' + kv('Da svapare', fmt.ml(A.stockMl)) + kv('Valore (a prezzo pagato)', fmt.eur(A.stockValue)) +
      kv('Ti basta per', A.stockDays != null ? fdate.days(A.stockDays) : '—') + '</div>';
    return h;
  }
};

/* ============================================================ IMPOSTAZIONI */
export const Settings = {
  title: 'Impostazioni',
  render() {
    const S = Store.state.settings;
    const n = Store.state.events.length;
    return '<div class="card"><h3>Prima dello svapo</h3>' +
      field('Smesso con le IQOS il', '<input class="inp" type="date" id="s-sw" value="' + esc(S.switchDate || '') + '">') +
      '<div class="grid3">' + field('Stick al giorno', '<input class="inp num" id="s-sd" inputmode="numeric" value="' + esc(S.iqos.sticksDay) + '">') +
      field('€ a pacchetto', '<input class="inp num" id="s-pp" inputmode="decimal" value="' + esc(dec(S.iqos.packPrice)) + '">') +
      field('Stick a pacch.', '<input class="inp num" id="s-sp" inputmode="numeric" value="' + esc(S.iqos.sticksPack) + '">') + '</div></div>' +
      '<div class="card"><h3>Dispositivo</h3><div class="grid2">' +
      field('Nome', '<input class="inp" id="s-dn" value="' + esc(S.device.name) + '">') +
      field('Pod (ml)', '<input class="inp num" id="s-pod" inputmode="decimal" value="' + esc(dec(S.device.podMl)) + '">') + '</div>' +
      '<button class="btn primary full" data-a="save">Salva</button></div>' +
      '<div class="card"><h3>Backup</h3><p class="small muted" style="margin-top:0">I dati stanno solo su questo telefono. Esporta un backup ogni tanto e mettilo in File o iCloud: se Safari cancella i dati, lo reimporti.</p>' +
      '<div class="btn-row"><button class="btn" data-a="export">⬆︎ Esporta</button>' + importButton('⬇︎ Importa') + '</div>' +
      (Store.hasPrevious() ? '<button class="btn ghost full" data-a="prev" style="margin-top:8px">Torna ai dati di prima dell\'ultima importazione</button>' : '') +
      '<div class="small faint" style="margin-top:10px">' + n + ' eventi · ' + Store.state.products.length + ' prodotti' +
      (Store.state.migratedFrom ? ' · convertiti dalla v1 il ' + esc(String(Store.state.migratedFrom.at).slice(0, 10)) : '') + '</div></div>' +
      '<div class="card"><h3>Sull\'iPhone</h3><p class="small muted" style="margin:0">Apri la pagina in Safari → Condividi → <b>Aggiungi alla schermata Home</b>. Si apre a tutto schermo, funziona senza rete, e Safari non cancella i dati delle app aggiunte alla Home.</p></div>' +
      '<button class="btn danger full" data-a="wipe" style="margin-top:6px">Cancella tutti i dati</button>';
  },
  mount(root) {
    on(root, {
      save: () => {
        Store.commit('Impostazioni', st => {
          const s = st.settings;
          s.switchDate = $('#s-sw', root).value || null;
          s.iqos.sticksDay = parseNum($('#s-sd', root).value); s.iqos.packPrice = parseNum($('#s-pp', root).value); s.iqos.sticksPack = parseNum($('#s-sp', root).value) || 20;
          s.device.name = $('#s-dn', root).value.trim(); s.device.podMl = parseNum($('#s-pod', root).value) || 5;
        });
        toast('Salvato', 'ok');
      },
      export: () => exportFile(),
      prev: () => confirmSheet('Tornare indietro?', 'Rimetto i dati com\'erano prima dell\'ultima importazione (e tengo da parte quelli di adesso).', 'Torna indietro', () => { Store.restorePrevious(); toast('Fatto', 'ok'); }),
      wipe: () => confirmSheet('Cancellare tutto?', 'Spariscono tutti i dati da questo telefono. Prima esporta un backup.', 'Cancella tutto', () => {
        Store.replace({ schema: 2, settings: Store.state.settings, products: [], events: [], review: [] }); toast('Dati cancellati (recuperabili da «Torna ai dati di prima»)');
      }, true)
    });
  }
};

function field(l, inp) { return '<div class="field"><label>' + l + '</label>' + inp + '</div>'; }

/* ============================================================ BACKUP */
export async function exportFile() {
  const json = Store.exportJson();
  const name = 'svapometro-' + localStamp().slice(0, 10) + '.json';
  if (window.Android && window.Android.exportJson) { window.Android.exportJson(json, name); return; }
  const file = new File([json], name, { type: 'application/json' });
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: 'Backup Svapometro' });
      Store.commit('Backup', st => { st.lastBackup = new Date().toISOString(); });
      return;
    }
  } catch (e) { if (e && e.name === 'AbortError') return; }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file); a.download = name; document.body.appendChild(a); a.click(); a.remove();
  Store.commit('Backup', st => { st.lastBackup = new Date().toISOString(); });
  toast('Backup scaricato', 'ok');
}

/* Su iPhone un selettore di file creato al volo e «cliccato» dal codice spesso non si apre,
   o non avvisa quando scegli il file. Qui il campo file è vero, sta nella pagina e copre il
   pulsante: il tocco arriva direttamente a lui. Nessun filtro sul tipo: iOS a volte rende
   grigi i .json arrivati da Android. */
export function importButton(label, cls) {
  return '<label class="btn ' + (cls || '') + '" style="position:relative;overflow:hidden">' + label +
    '<input type="file" data-import aria-label="Scegli il file di backup" ' +
    'style="position:absolute;inset:0;width:100%;height:100%;opacity:0;font-size:200px;cursor:pointer"></label>';
}

document.addEventListener('change', e => {
  const inp = e.target;
  if (!inp || !inp.matches || !inp.matches('input[data-import]')) return;
  const f = inp.files && inp.files[0];
  inp.value = '';
  if (f) readBackup(f);
});

function readText(f) {
  if (f.text) return f.text();
  return new Promise((ok, ko) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = () => ko(r.error); r.readAsText(f); });
}

export function readBackup(f) {
  toast('Leggo «' + f.name + '»…');
  readText(f).then(txt => {
    let r;
    try { r = Store.parseBackup(String(txt).replace(/^\uFEFF/, '')); }
    catch (e) { toast('Non è un backup di Svapometro (' + (e.message || 'formato') + ')', 'err'); return; }
    const st = r.state;
    const A = analyze(st);
    const asks = st.review.filter(x => x.kind === 'ask').length;
    confirmSheet(r.from === 'v1' ? 'Backup della vecchia app' : 'Ripristinare il backup?',
      st.products.length + ' prodotti, ' + st.events.length + ' eventi, ' + fmt.eur(A.spent) + ' di spese.' +
      (r.from === 'v1' ? ' L\'ho convertito: ' + asks + ' cose da sistemare te le mostro in Oggi.' : '') +
      (Store.state.events.length ? ' I dati attuali li tengo da parte, puoi tornarci da Impostazioni.' : ''),
      'Importa', () => { Store.replace(st); toast('Importato', 'ok'); App.go('home'); });
  }).catch(e => toast('Non riesco a leggere il file: ' + (e && e.message ? e.message : e), 'err'));
}

/* ============================================================ DA SISTEMARE */
export function reviewSheet() {
  const items = Store.state.review;
  const asks = items.filter(r => r.kind === 'ask');
  const infos = items.filter(r => r.kind !== 'ask');
  const row = r => {
    const ev = r.ref && Store.event(r.ref);
    const isSpend = ev && ev.t === 'spend';
    const prod = r.ref && Store.product(r.ref);
    return '<div class="card tight"><div class="small" style="line-height:1.45">' + esc(r.text) + '</div><div class="btn-row" style="margin-top:10px">' +
      (isSpend ? '<button class="btn small primary" data-a="conv" data-id="' + r.ref + '">È un liquido</button>' : '') +
      (prod ? '<button class="btn small" data-a="prod" data-id="' + r.ref + '">Apri</button>' : '') +
      '<button class="btn small ghost" data-a="ok" data-id="' + r.id + '">' + (isSpend ? 'Lascia come spesa' : 'Ok') + '</button></div></div>';
  };
  Sheet.open({
    title: 'Da sistemare', sub: 'Dalla conversione della vecchia app',
    body: (asks.length ? asks.map(row).join('') : '<div class="note">Niente da decidere.</div>') +
      (infos.length ? '<details style="margin-top:14px"><summary class="small faint">Cosa ho fatto da solo (' + infos.length + ')</summary><div class="gap"></div>' + infos.map(row).join('') + '</details>' : ''),
    mount(sh) {
      sh.addEventListener('click', e => {
        const el = e.target.closest('[data-a]'); if (!el) return;
        const id = el.dataset.id;
        if (el.dataset.a === 'ok') {
          Store.commit('Ok', st => {
            const r = st.review.find(x => x.id === id);
            if (r && r.ref) { const ev = st.events.find(x => x.id === r.ref); if (ev) delete ev.review; }
            st.review = st.review.filter(x => x.id !== id);
          });
          el.closest('.card').remove();
        } else if (el.dataset.a === 'conv') { Sheet.close(); setTimeout(() => F.buy({ fromSpend: id }), 320); }
        else if (el.dataset.a === 'prod') { Sheet.close(); App.push('product', id); }
      });
    }
  });
}

/* ============================================================ timer e router (riempiti da app.js) */
export const Timers = {
  list: [],
  every(ms, fn) { this.list.push(setInterval(fn, ms)); },
  clear() { this.list.forEach(clearInterval); this.list = []; }
};
export const App = { go() { }, push() { }, refresh() { } };

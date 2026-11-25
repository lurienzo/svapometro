/* ============================================================
   Le registrazioni. Ognuna è UN foglio e scrive UN tipo di evento.
   Rabbocco · Ho comprato · Cambio coil · Livello boccetta · Spesa varia
   ============================================================ */
import { KINDS, SPEND_CATS, fullName, localStamp, uid } from './model.js';
import { analyze, bottlesOf, stockByProduct } from './calc.js';
import { Store } from './store.js';
import { Catalog, FMT, fmtLabel, norm, searchMine } from './catalog.js';
import { $, $$, esc, fmt, fdate, parseNum, dec, toast, Sheet, haptic, sliderHtml, bindSlider, levelBar, confirmSheet } from './ui.js';

const MG = [0, 3, 4, 6, 8, 9, 10, 12, 16, 18, 20];

function nowStamp() { return localStamp(new Date()); }
function whenField(id, value) {
  return '<div class="field"><label>Quando</label><input class="inp" type="datetime-local" id="' + id + '" value="' + esc(value || nowStamp()) + '"></div>';
}
const brandLine = p => [p.brand, p.line && fullName(p) !== p.line + ' ' + p.name ? '' : ''].filter(Boolean).join(' · ');

/* ============================================================ RABBOCCO */
export function refill(prePid) {
  const A = analyze(Store.state);
  const D = A.D;
  const S = Store.state.settings;
  const pod = +S.device.podMl || 5;
  const stock = stockByProduct(D);
  const cands = [...stock.entries()]
    .filter(([pid]) => { const p = D.prod.get(pid); return p && KINDS[p.kind] && KINDS[p.kind].vape; })
    .map(([pid, x]) => ({ p: D.prod.get(pid), x, open: bottlesOf(D, pid)[0] }));
  // l'ultimo usato per primo
  const lastUse = [...D.uses].reverse().find(u => u.kind === 'refill' && u.pid && stock.has(u.pid));
  cands.sort((a, b) => (lastUse && b.p.id === lastUse.pid) - (lastUse && a.p.id === lastUse.pid) ||
    (b.x.open - a.x.open) || (a.p.name < b.p.name ? -1 : 1));
  let pid = prePid && stock.has(prePid) ? prePid : (cands[0] ? cands[0].p.id : null);

  const picks = cands.map(c =>
    '<button class="pick' + (c.p.id === pid ? ' on' : '') + '" data-a="pick" data-pid="' + c.p.id + '">' +
    '<div class="t">' + esc(fullName(c.p)) + '</div>' +
    '<div class="s">' + esc(c.p.brand || KINDS[c.p.kind].short) + ' · ' + fmt.ml(c.x.ml) + (c.x.n > 1 ? ' · ' + c.x.n + ' bocc.' : '') + '</div>' +
    levelBar(c.open.left, c.open.ml) + '</button>').join('') +
    '<button class="pick' + (pid === null ? ' on' : '') + '" data-a="pick" data-pid=""><div class="t">Nessuna boccetta</div>' +
    '<div class="s">conta solo per la coil</div></button>';

  const coilTxt = A.coil ? 'Coil al ' + fmt.pct(A.coil.pct) : 'Nessuna coil montata';

  Sheet.open({
    title: 'Rabbocco', sub: coilTxt,
    body:
      '<div class="field"><label>Con cosa</label><div class="picks">' + picks + '</div></div>' +
      '<div class="chips" style="margin-bottom:4px">' +
      [[pod, 'Pod pieno'], [pod / 2, 'Metà'], [1, '1 ml'], [2, '2 ml'], [3, '3 ml']].map(([v, l]) =>
        '<button class="chip" data-a="q" data-v="' + v + '">' + l + '</button>').join('') + '</div>' +
      sliderHtml('r-ml', 0.5, Math.max(pod * 2, 10), 0.5, pod) +
      '<details style="margin-top:6px"><summary class="small faint">Quando: adesso · cambia</summary><div class="gap"></div>' + whenField('r-at') + '</details>',
    foot: '<button class="btn primary full" data-x="ok">Registra rabbocco</button>',
    mount(sh) {
      const sl = bindSlider(sh, 'r-ml', v => {
        if (!pid) return '';
        const bs = bottlesOf(D, pid).filter(b => b.left > 0.05);
        const tot = bs.reduce((a, b) => a + b.left, 0);
        const first = bs[0];
        if (!first) return '';
        if (v > tot + 0.05) return '<span class="bad">Ne hai solo ' + fmt.ml(tot) + '</span>';
        if (v > first.left + 0.05) return 'finisce la boccetta aperta, ' + fmt.ml(v - first.left) + ' dalla prossima';
        return 'nella boccetta restano ' + fmt.ml(first.left - v);
      });
      $$('[data-a=pick]', sh).forEach(b => b.onclick = () => {
        pid = b.dataset.pid || null;
        $$('[data-a=pick]', sh).forEach(x => x.classList.toggle('on', x === b));
        haptic(); sl.set(sl.get());
      });
      $$('[data-a=q]', sh).forEach(b => b.onclick = () => { haptic(); sl.set(parseNum(b.dataset.v)); });
      $('[data-x=ok]', sh).onclick = () => {
        const ml = sl.get();
        const at = ($('#r-at', sh).value || nowStamp()).slice(0, 16);
        let rest = ml;
        const evs = [];
        if (pid) {
          for (const b of bottlesOf(D, pid).filter(b => b.left > 0.05)) {
            if (rest <= 0.001) break;
            const take = Math.min(b.left, rest);
            evs.push({ t: 'refill', at, ml: Math.round(take * 100) / 100, bid: b.id });
            rest -= take;
          }
          if (rest > 0.05) {
            if (evs.length) evs[evs.length - 1].ml = Math.round((evs[evs.length - 1].ml + rest) * 100) / 100;
            else evs.push({ t: 'refill', at, ml, bid: null });
          }
        } else evs.push({ t: 'refill', at, ml, bid: null });
        const { undo } = Store.commit('Rabbocco', st => { for (const e of evs) Store.addEvent(st, e); });
        Sheet.close(); haptic(20);
        const A2 = analyze(Store.state);
        const p = pid ? A2.D.prod.get(pid) : null;
        const left = p ? (stockByProduct(A2.D).get(pid) || { ml: 0 }).ml : 0;
        toast(fmt.ml(ml) + (p ? ' di ' + p.name + ' · restano ' + fmt.ml(left) : '') +
          (A2.coil ? ' · coil ' + fmt.pct(A2.coil.pct) : ''), 'ok', undo);
      };
    }
  });
}

/* ============================================================ HO COMPRATO */
/** preset: { pid } prodotto tuo, { fromSpend: eventId } converte una spesa scollegata */
export function buy(preset) {
  preset = preset || {};
  if (preset.pid) return buyForm({ p: Store.product(preset.pid) }, preset);
  const recent = recentProducts(8);
  Sheet.open({
    title: preset.fromSpend ? 'Cos\'era questa spesa?' : 'Ho comprato',
    sub: preset.fromSpend ? 'Cerca il liquido: la spesa diventa un acquisto con la sua scorta' : 'Cerca fra i tuoi liquidi e nel catalogo',
    body:
      '<div class="search"><input class="inp" id="b-q" placeholder="Nome, marca o linea…" autocomplete="off" autocorrect="off" spellcheck="false"></div>' +
      (preset.fromSpend ? '' : '<div class="chips" style="margin-top:10px">' +
        '<button class="chip" data-a="coil">🌀 Coil</button>' +
        '<button class="chip" data-a="spend">🧾 Altra spesa</button></div>') +
      '<div id="b-res">' +
      (recent.length ? '<div class="res-h">Ricompra</div><div class="list">' + recent.map(mineRow).join('') + '</div>' : '') +
      '</div>',
    mount(sh) {
      const q = $('#b-q', sh);
      const res = $('#b-res', sh);
      let t = null;
      const run = () => {
        const v = q.value.trim();
        if (!v) { res.innerHTML = recent.length ? '<div class="res-h">Ricompra</div><div class="list">' + recent.map(mineRow).join('') + '</div>' : ''; return; }
        const mine = searchMine(Store.state.products, v).slice(0, 8);
        let h = '';
        if (mine.length) h += '<div class="res-h">I tuoi</div><div class="list">' + mine.map(mineRow).join('') + '</div>';
        if (Catalog.ready) {
          const cat = Catalog.search(v, 30);
          if (cat.length) h += '<div class="res-h">Catalogo</div><div class="list">' + cat.map(catRow).join('') + '</div>';
        } else h += '<div class="note" style="margin-top:12px">Carico il catalogo…</div>';
        h += '<button class="btn full" style="margin-top:12px" data-a="manual">＋ Aggiungi «' + esc(v) + '» a mano</button>';
        res.innerHTML = h;
      };
      q.addEventListener('input', () => { clearTimeout(t); t = setTimeout(run, 120); });
      Catalog.load().then(() => { if (q.value.trim()) run(); }).catch(() => { });
      sh.addEventListener('click', e => {
        const el = e.target.closest('[data-a]');
        if (!el) return;
        const a = el.dataset.a;
        if (a === 'mine') buyForm({ p: Store.product(el.dataset.pid) }, preset);
        else if (a === 'cat') buyForm({ item: Catalog.items[+el.dataset.i] }, preset);
        else if (a === 'manual') buyForm({ manual: q.value.trim() }, preset);
        else if (a === 'coil') buyCoil();
        else if (a === 'spend') spend();
      });
      setTimeout(() => q.focus(), 350);
    }
  });
}

function recentProducts(n) {
  const seen = new Set(), out = [];
  const evs = Store.state.events.filter(e => e.t === 'buy').sort((a, b) => (a.at < b.at ? 1 : -1));
  for (const e of evs) {
    const p = Store.product(e.pid);
    if (!p || seen.has(p.id) || p.kind === 'coil' || p.archived) continue;
    seen.add(p.id); out.push(p);
    if (out.length >= n) break;
  }
  return out;
}

function mineRow(p) {
  const A = analyze(Store.state);
  const s = stockByProduct(A.D).get(p.id);
  return '<button class="li" data-a="mine" data-pid="' + p.id + '"><div class="ic">' + kindIcon(p.kind) + '</div>' +
    '<div class="tx"><div class="t">' + esc(fullName(p)) + '</div><div class="s">' +
    esc([p.brand, KINDS[p.kind] ? KINDS[p.kind].short : '', p.mg != null ? fmt.n1(p.mg) + ' mg' : ''].filter(Boolean).join(' · ')) +
    '</div></div><div class="r small ' + (s ? 'amber' : 'faint') + '">' + (s ? fmt.ml(s.ml) : 'finito') + '</div></button>';
}

function catRow(it) {
  return '<button class="li" data-a="cat" data-i="' + it.i + '"><div class="tx">' +
    '<div class="t">' + (it.line ? '<span class="faint">' + esc(it.line) + ' · </span>' : '') + esc(it.name) + '</div>' +
    '<div class="s">' + esc(it.brand + (it.note ? ' · ' + it.note : '')) + '</div>' +
    '<div>' + it.fmts.map(f => '<span class="fmt">' + esc(fmtLabel(f)) + '</span>').join('') + '</div>' +
    '</div><span class="chev">›</span></button>';
}

export function kindIcon(k) {
  return { pronto: '💧', shot: '🧪', aroma: '🌿', basetta: '⚗️', base: '🫙', coil: '🌀', device: '🔋' }[k] || '•';
}

/** ultimo prezzo pagato (a boccetta) per un prodotto */
function lastUnitPrice(pid) {
  const evs = Store.state.events.filter(e => e.t === 'buy' && e.pid === pid && +e.price > 0).sort((a, b) => (a.at < b.at ? 1 : -1));
  return evs.length ? +evs[0].price / Math.max(1, +evs[0].qty || 1) : null;
}
/** quanto hai pagato l'ultima volta un prodotto dello stesso tipo e formato (i negozi fisici costano più del catalogo online) */
function lastKindPrice(kind, ml) {
  const evs = Store.state.events.filter(e => e.t === 'buy' && +e.price > 0 && +e.mlEach === +ml && (Store.product(e.pid) || {}).kind === kind)
    .sort((a, b) => (a.at < b.at ? 1 : -1));
  return evs.length ? +evs[0].price / Math.max(1, +evs[0].qty || 1) : null;
}
function lastMg() {
  const evs = Store.state.events.filter(e => e.t === 'buy').sort((a, b) => (a.at < b.at ? 1 : -1));
  for (const e of evs) { const p = Store.product(e.pid); if (p && (p.kind === 'pronto' || p.kind === 'shot')) { const mg = e.mg != null ? e.mg : p.mg; if (mg != null) return +mg; } }
  return 6;
}

function buyForm(src, preset) {
  const p0 = src.p || null;
  const it = src.item || null;
  // stato del modulo
  const F = {
    name: p0 ? p0.name : it ? it.name : (src.manual || ''),
    brand: p0 ? p0.brand : it ? it.brand : '',
    line: p0 ? p0.line || '' : it ? it.line : '',
    kind: p0 ? p0.kind : it ? FMT[it.fmts[0][0]].kind : 'pronto',
    ml: p0 ? +p0.ml || 10 : it ? (['M', 'S'].includes(it.fmts[0][0]) ? it.fmts[0][2] : it.fmts[0][1]) : 10,
    aroma: it && ['M', 'S'].includes(it.fmts[0][0]) ? it.fmts[0][1] : (p0 && p0.aromaMl) || null,
    mg: p0 && p0.mg != null ? +p0.mg : lastMg(),
    qty: 1,
    unit: p0 ? lastUnitPrice(p0.id) : it ? (lastKindPrice(FMT[it.fmts[0][0]].kind, ['M', 'S'].includes(it.fmts[0][0]) ? it.fmts[0][2] : it.fmts[0][1]) || it.fmts[0][3]) : null,
    fmtIdx: 0,
    useBase: false
  };
  if (F.kind === 'aroma' || F.kind === 'base') F.mg = null;
  const fromSpend = preset.fromSpend ? Store.event(preset.fromSpend) : null;
  if (fromSpend) F.unit = +fromSpend.amount;
  const date0 = fromSpend ? fromSpend.at : nowStamp();

  const basettaStock = () => {
    const A = analyze(Store.state);
    return A.D.bottles.filter(b => b.left > 0.05 && (A.D.prod.get(b.pid) || {}).kind === 'basetta');
  };

  const render = () => {
    const isShot = F.kind === 'shot';
    const hasMg = F.kind === 'pronto' || F.kind === 'shot' || F.kind === 'basetta';
    const mlOpts = isShot ? [20, 30, 50, 60, 100, 120] : F.kind === 'base' ? [100, 250, 500, 1000] : [10, 20, 30, 50, 60, 100];
    const totDefault = F.unit != null ? F.unit * F.qty : '';
    let h = '';
    if (!p0 && it && !F.showNames) {
      h += '<button class="small amber" data-a="names" style="margin:-4px 0 12px 2px;font-weight:650">Modifica nome o marca</button>';
    }
    if (!p0 && (!it || F.showNames)) {
      h += '<div class="field"><label>Nome</label><input class="inp" id="f-name" value="' + esc(F.name) + '"></div>' +
        '<div class="grid2"><div class="field"><label>Marca</label><input class="inp" id="f-brand" value="' + esc(F.brand) + '"></div>' +
        '<div class="field"><label>Linea</label><input class="inp" id="f-line" value="' + esc(F.line) + '" placeholder="facoltativa"></div></div>';
    }
    if (!p0) {
      if (it && it.fmts.length > 1) {
        h += '<div class="field"><label>Formato</label><div class="chips wrap">' + it.fmts.map((f, i) =>
          '<button class="chip' + (i === F.fmtIdx ? ' on' : '') + '" data-a="fmt" data-i="' + i + '">' + esc(fmtLabel(f)) +
          (f[3] ? ' · ' + fmt.eur(f[3]) : '') + '</button>').join('') + '</div></div>';
      }
      if (!it) h += '<div class="field"><label>Che cos\'è</label><div class="chips wrap">' +
        ['pronto', 'shot', 'aroma', 'basetta', 'base'].map(k => '<button class="chip' + (F.kind === k ? ' on' : '') + '" data-a="kind" data-k="' + k + '">' + kindIcon(k) + ' ' + KINDS[k].short + '</button>').join('') +
        '</div></div>';
    }
    h += '<div class="field"><label>' + (isShot ? 'Flacone finale, già allungato' : 'Boccetta da') + '</label><div class="chips wrap">' +
      mlOpts.map(v => '<button class="chip' + (+F.ml === v ? ' on' : '') + '" data-a="ml" data-v="' + v + '">' + v + ' ml</button>').join('') +
      '</div>' + (mlOpts.indexOf(+F.ml) < 0 ? '<div class="small faint" style="margin-top:6px">Ora: ' + fmt.ml(F.ml) + '</div>' : '') +
      (isShot && F.aroma ? '<div class="small faint" style="margin-top:6px">' + F.aroma + ' ml di aroma + ' + (F.ml - F.aroma) + ' ml di basette o base</div>' : '') + '</div>';
    if (hasMg) {
      h += '<div class="field"><label>Nicotina' + (isShot ? ' finale' : '') + '</label><div class="chips">' +
        MG.map(v => '<button class="chip' + (F.mg === v ? ' on' : '') + '" data-a="mg" data-v="' + v + '">' + v + ' mg</button>').join('') + '</div></div>';
    }
    h += '<div class="grid2"><div class="field"><label>Quante</label><div class="stepper"><button data-a="qty" data-d="-1">−</button>' +
      '<input id="f-qty" inputmode="numeric" value="' + F.qty + '"><button data-a="qty" data-d="1">+</button></div></div>' +
      '<div class="field"><label>Prezzo totale</label><div class="inp-suffix"><input class="inp num" id="f-price" inputmode="decimal" placeholder="0,00" value="' + esc(dec(totDefault)) + '"><span>€</span></div></div></div>' +
      (F.unit != null && F.qty > 1 ? '<div class="small faint" style="margin:-8px 0 12px 2px">' + fmt.eur(F.unit) + ' l\'una</div>' : '');
    if (isShot && F.aroma && basettaStock().length) {
      h += '<button class="chip' + (F.useBase ? ' on' : '') + '" data-a="usebase" style="margin-bottom:14px">⚗️ Allungato con basette della mia scorta</button>';
    }
    h += whenField('f-at', date0);
    return h;
  };

  const title = p0 ? fullName(p0) : it ? (it.line && norm(it.name).indexOf(norm(it.line)) < 0 ? it.line + ' ' : '') + it.name : 'Nuovo prodotto';
  const sub = p0 ? [p0.brand, KINDS[p0.kind].short].filter(Boolean).join(' · ') : it ? it.brand + (it.line ? ' · ' + it.line : '') : '';
  Sheet.open({
    title, sub,
    body: '<div id="f-body">' + render() + '</div>',
    foot: '<button class="btn primary full" data-x="ok">' + (fromSpend ? 'Trasforma in acquisto' : 'Aggiungi alla scorta') + '</button>',
    mount(sh) {
      const body = $('#f-body', sh);
      const keep = () => {   // conserva quello che hai scritto prima di ridisegnare
        if ($('#f-name', sh)) { F.name = $('#f-name', sh).value; F.brand = $('#f-brand', sh).value; F.line = $('#f-line', sh).value; }
        F.qty = Math.max(1, parseInt($('#f-qty', sh).value, 10) || 1);
        const pr = $('#f-price', sh).value;
        F.priceTyped = pr;
        F.at = $('#f-at', sh).value;
      };
      const redraw = () => {
        const at = F.at, typed = F.priceTyped;
        body.innerHTML = render();
        if (at) $('#f-at', sh).value = at;
        if (F.keepPrice && typed != null) $('#f-price', sh).value = typed;
      };
      $('#f-price', sh) && sh.addEventListener('input', e => { if (e.target.id === 'f-price') F.keepPrice = true; });
      sh.addEventListener('click', e => {
        const el = e.target.closest('[data-a]');
        if (!el || !body.contains(el)) return;
        keep(); haptic();
        const a = el.dataset.a;
        if (a === 'ml') F.ml = +el.dataset.v;
        else if (a === 'mg') F.mg = +el.dataset.v;
        else if (a === 'kind') { F.kind = el.dataset.k; if (F.kind === 'aroma' || F.kind === 'base') F.mg = null; else if (F.mg == null) F.mg = lastMg(); }
        else if (a === 'qty') { F.qty = Math.max(1, F.qty + (+el.dataset.d)); }
        else if (a === 'usebase') F.useBase = !F.useBase;
        else if (a === 'names') F.showNames = true;
        else if (a === 'fmt') {
          const f = it.fmts[+el.dataset.i];
          F.fmtIdx = +el.dataset.i; F.kind = FMT[f[0]].kind;
          F.ml = (f[0] === 'M' || f[0] === 'S') ? f[2] : f[1];
          F.aroma = (f[0] === 'M' || f[0] === 'S') ? f[1] : null;
          F.unit = lastKindPrice(F.kind, F.ml) || f[3] || F.unit; F.keepPrice = false;
          if (F.kind === 'aroma' || F.kind === 'base') F.mg = null; else if (F.mg == null) F.mg = lastMg();
        }
        if (a === 'qty' && !F.keepPrice) F.priceTyped = null;
        redraw();
      });
      $('[data-x=ok]', sh).onclick = () => {
        keep();
        const name = (F.name || '').trim();
        if (!p0 && !name) { toast('Manca il nome', 'err'); return; }
        const price = parseNum($('#f-price', sh).value);
        const at = (F.at || nowStamp()).slice(0, 16);
        const { undo } = Store.commit('Acquisto', st => {
          let p = p0 ? st.products.find(x => x.id === p0.id) : null;
          // stesso liquido già in libreria (stesso catalogo, o stesso nome e marca): niente doppioni
          if (!p) p = st.products.find(x => (it && x.catRef === it.i && x.kind === F.kind) ||
            (norm(x.name) === norm(name) && norm(x.brand) === norm(F.brand || '') && norm(x.line || '') === norm(F.line || '') && x.kind === F.kind)) || null;
          if (!p) {
            p = Store.addProduct(st, {
              kind: F.kind, name, brand: (F.brand || '').trim(), line: (F.line || '').trim(), ml: F.ml,
              mg: F.mg, aromaMl: F.aroma || null, rating: null, notes: '', catRef: it ? it.i : null, fam: it ? it.fam : '', added: at.slice(0, 10)
            });
          } else {
            p.ml = F.ml;
            if (F.mg != null) p.mg = F.mg;
          }
          const e = { t: 'buy', at, pid: p.id, qty: F.qty, mlEach: F.ml, price: Math.round(price * 100) / 100 };
          if (F.mg != null) e.mg = F.mg;
          if (F.kind === 'shot' && F.useBase && F.aroma) {
            let need = (F.ml - F.aroma) * F.qty;
            const draws = [];
            for (const b of basettaStock()) {
              if (need <= 0.01) break;
              const take = Math.min(b.left, need);
              draws.push({ bid: b.id, ml: Math.round(take * 100) / 100 });
              need -= take;
            }
            if (draws.length) e.draws = draws;
          }
          Store.addEvent(st, e);
          if (fromSpend) {
            Store.removeEvent(st, fromSpend.id);
            st.review = st.review.filter(r => r.ref !== fromSpend.id);
          }
        });
        Sheet.close(); haptic(20);
        toast('+' + F.qty + ' × ' + fmt.ml(F.ml) + ' in scorta' + (price > 0 ? ' · ' + fmt.eur(price) : ''), 'ok', undo);
      };
    }
  });
}

/* ============================================================ COIL: acquisto */
export function buyCoil(thenMount) {
  const S = Store.state.settings;
  const coilsMine = Store.state.products.filter(p => p.kind === 'coil' && !p.archived);
  let pid = coilsMine.length ? coilsMine[coilsMine.length - 1].id : null;
  const lastUnit = (() => {
    const evs = Store.state.events.filter(e => e.t === 'buy' && Store.product(e.pid) && Store.product(e.pid).kind === 'coil' && +e.price > 0).sort((a, b) => (a.at < b.at ? 1 : -1));
    return evs.length ? evs[0].price / Math.max(1, evs[0].qty) : 3;
  })();
  Sheet.open({
    title: 'Coil comprate', sub: 'Vanno nella scorta: quando le monti non costano di nuovo',
    body:
      (coilsMine.length ? '<div class="field"><label>Modello</label><div class="chips wrap">' + coilsMine.map(p =>
        '<button class="chip' + (p.id === pid ? ' on' : '') + '" data-a="pm" data-pid="' + p.id + '">' + esc(p.name) + '</button>').join('') +
        '<button class="chip' + (pid ? '' : ' on') + '" data-a="pm" data-pid="">＋ Altro</button></div></div>' : '') +
      '<div class="field" id="c-new"' + (pid ? ' hidden' : '') + '><label>Nome del modello</label><input class="inp" id="c-name" value="' + esc(S.coil.model) + '"></div>' +
      '<div class="grid2"><div class="field"><label>Quante</label><div class="stepper"><button data-a="q" data-d="-1">−</button>' +
      '<input id="c-qty" inputmode="numeric" value="5"><button data-a="q" data-d="1">+</button></div></div>' +
      '<div class="field"><label>Prezzo totale</label><div class="inp-suffix"><input class="inp num" id="c-price" inputmode="decimal" value="' + dec(lastUnit * 5) + '"><span>€</span></div></div></div>' +
      whenField('c-at'),
    foot: '<button class="btn primary full" data-x="ok">' + (thenMount ? 'Registra e monta' : 'Aggiungi alla scorta') + '</button>',
    mount(sh) {
      let priceTouched = false;
      $('#c-price', sh).addEventListener('input', () => { priceTouched = true; });
      sh.addEventListener('click', e => {
        const el = e.target.closest('[data-a]'); if (!el) return;
        haptic();
        if (el.dataset.a === 'pm') {
          pid = el.dataset.pid || null;
          $$('[data-a=pm]', sh).forEach(x => x.classList.toggle('on', x === el));
          $('#c-new', sh).hidden = !!pid;
        } else if (el.dataset.a === 'q') {
          const i = $('#c-qty', sh);
          i.value = Math.max(1, (parseInt(i.value, 10) || 1) + (+el.dataset.d));
          if (!priceTouched) $('#c-price', sh).value = dec(lastUnit * +i.value);
        }
      });
      $('[data-x=ok]', sh).onclick = () => {
        const qty = Math.max(1, parseInt($('#c-qty', sh).value, 10) || 1);
        const price = parseNum($('#c-price', sh).value);
        const at = ($('#c-at', sh).value || nowStamp()).slice(0, 16);
        let evId = null;
        const { undo } = Store.commit('Coil comprate', st => {
          let p = pid ? st.products.find(x => x.id === pid) : null;
          if (!p) p = Store.addProduct(st, { kind: 'coil', name: ($('#c-name', sh).value || 'Coil').trim(), brand: '', line: '', ml: 0, mg: null, rating: null, notes: '' });
          evId = Store.addEvent(st, { t: 'buy', at, pid: p.id, qty, mlEach: 0, price: Math.round(price * 100) / 100 }).id;
        });
        Sheet.close(); haptic(20);
        toast('+' + qty + ' coil in scorta', 'ok', undo);
        if (thenMount) setTimeout(() => coilChange(evId + '.0'), 340);
      };
    }
  });
}

/* ============================================================ CAMBIO COIL */
export function coilChange(preUid) {
  const A = analyze(Store.state);
  const S = Store.state.settings;
  const spare = A.coilSpare;
  let unit = preUid || (spare[0] ? spare[0].id : null);
  const cur = A.coil;
  const lifeDefault = A.coilDone.length >= 2 ? Math.round(A.coilAvgMl / 5) * 5 : (+S.coil.lifeMl || 40);
  const wattDefault = cur ? cur.unit.watt || S.coil.watt : S.coil.watt;
  const groups = {};
  for (const u of spare) (groups[u.model] = groups[u.model] || []).push(u);

  Sheet.open({
    title: 'Cambio coil',
    sub: cur ? 'La vecchia ha fatto ' + fmt.ml(cur.ml) + ' in ' + fdate.days(cur.days) : 'Monta la prima coil',
    body:
      (spare.length
        ? '<div class="field"><label>Dalla scorta (' + spare.length + ')</label><div class="chips wrap">' +
          Object.keys(groups).map(m => '<button class="chip' + (groups[m].some(u => u.id === unit) ? ' on' : '') + '" data-a="u" data-u="' + groups[m][0].id + '">' +
            esc(m) + ' · ' + groups[m].length + '</button>').join('') + '</div></div>'
        : '<div class="note" style="margin-bottom:14px">Non hai coil di scorta registrate. <button class="amber" data-a="bought" style="font-weight:700">L\'ho appena comprata →</button><br>Oppure montala lo stesso: non entrerà nelle spese.</div>') +
      '<div class="field"><label>Watt</label>' + sliderHtml('c-w', 8, 25, 0.5, wattDefault, 'W') + '</div>' +
      '<div class="field"><label>Quanto dovrebbe durare</label>' + sliderHtml('c-l', 15, 100, 5, lifeDefault) + '</div>' +
      (A.coilDone.length >= 2 ? '<div class="note" style="margin-top:-6px;margin-bottom:12px">Le tue durano in media <b>' + fmt.ml(A.coilAvgMl) + '</b> in <b>' + fdate.days(A.coilAvgDays) + '</b>.</div>' : '') +
      whenField('c-at'),
    foot: '<button class="btn primary full" data-x="ok">Montata</button>',
    mount(sh) {
      const w = bindSlider(sh, 'c-w', null, 'W');
      const l = bindSlider(sh, 'c-l', v => A.mlDay ? 'circa ' + fdate.days(v / A.mlDay) + ' al tuo ritmo' : '');
      sh.addEventListener('click', e => {
        const el = e.target.closest('[data-a]'); if (!el) return;
        if (el.dataset.a === 'u') { unit = el.dataset.u; $$('[data-a=u]', sh).forEach(x => x.classList.toggle('on', x === el)); haptic(); }
        if (el.dataset.a === 'bought') { Sheet.close(); setTimeout(() => buyCoil(true), 320); }
      });
      $('[data-x=ok]', sh).onclick = () => {
        const u = unit ? A.D.coilUnits.find(x => x.id === unit) : null;
        const at = ($('#c-at', sh).value || nowStamp()).slice(0, 16);
        const { undo } = Store.commit('Cambio coil', st => {
          Store.addEvent(st, { t: 'coil', at, uid: u ? u.id : null, model: u ? u.model : S.coil.model, watt: w.get(), lifeMl: l.get() });
          st.settings.coil = { model: u ? u.model : S.coil.model, watt: w.get(), lifeMl: st.settings.coil.lifeMl };
        });
        Sheet.close(); haptic(24);
        toast('Coil montata' + (spare.length > 1 ? ' · te ne restano ' + (spare.length - 1) : spare.length === 1 ? ' · scorta finita' : ''), 'ok', undo);
      };
    }
  });
}

/* ============================================================ LIVELLO BOCCETTA */
export function level(bid) {
  const A = analyze(Store.state);
  const b = A.D.bottles.find(x => x.id === bid);
  if (!b) return;
  const p = A.D.prod.get(b.pid);
  const step = b.ml > 50 ? 1 : 0.5;
  let vaped = KINDS[p.kind].vape;
  Sheet.open({
    title: 'Quanto ne resta?', sub: fullName(p) + ' · boccetta da ' + fmt.ml(b.ml),
    body:
      sliderHtml('l-v', 0, b.ml, step, Math.round(b.left / step) * step) +
      '<div class="chips" style="margin:4px 0 14px">' + [[0, 'Vuota'], [.25, '¼'], [.5, 'Metà'], [.75, '¾'], [1, 'Piena']].map(([f, n]) =>
        '<button class="chip" data-a="f" data-v="' + f + '">' + n + '</button>').join('') + '</div>' +
      '<div id="l-why"><div class="field"><label>Quello che manca</label><div class="seg">' +
      '<button data-a="why" data-v="1" class="' + (vaped ? 'on' : '') + '">' + (KINDS[p.kind].vape ? 'L\'ho svapato' : 'L\'ho usato') + '</button>' +
      '<button data-a="why" data-v="0" class="' + (vaped ? '' : 'on') + '">Perso o buttato</button></div></div></div>' +
      '<div class="note">Scrivi quello che vedi nella boccetta. Ora risulta <b>' + fmt.ml(b.left) + '</b>.</div>',
    foot: '<button class="btn primary full" data-x="ok">Salva livello</button>',
    mount(sh) {
      const sl = bindSlider(sh, 'l-v', v => {
        const d = b.left - v;
        $('#l-why', sh).style.display = d > 0.05 ? '' : 'none';
        return d > 0.05 ? fmt.ml(d) + ' in meno' : d < -0.05 ? fmt.ml(-d) + ' in più' : 'nessun cambiamento';
      });
      sh.addEventListener('click', e => {
        const el = e.target.closest('[data-a]'); if (!el) return;
        haptic();
        if (el.dataset.a === 'f') sl.set(Math.round(b.ml * +el.dataset.v / step) * step);
        if (el.dataset.a === 'why') { vaped = el.dataset.v === '1'; $$('[data-a=why]', sh).forEach(x => x.classList.toggle('on', x === el)); }
      });
      $('[data-x=ok]', sh).onclick = () => {
        const v = sl.get();
        if (Math.abs(v - b.left) < 0.05) { Sheet.close(); return; }
        const { undo } = Store.commit('Livello', st => {
          Store.addEvent(st, { t: 'level', at: nowStamp(), bid: b.id, left: v, vaped: v < b.left ? vaped : undefined });
        });
        Sheet.close(); haptic(20);
        toast(p.name + ': ' + (v <= 0.05 ? 'finita' : fmt.ml(v) + ' rimasti'), 'ok', undo);
      };
    }
  });
}

/* ============================================================ SPESA VARIA */
export function spend(preset) {
  preset = preset || {};
  let cat = preset.cat || 'hardware';
  Sheet.open({
    title: 'Altra spesa', sub: 'Per quello che non va in scorta: pod di ricambio, dispositivi, accessori',
    body:
      '<div class="field"><label>Cosa</label><input class="inp" id="s-l" placeholder="es. pod di ricambio" value="' + esc(preset.label || '') + '"></div>' +
      '<div class="field"><label>Quanto</label><div class="inp-suffix"><input class="inp num" id="s-a" inputmode="decimal" placeholder="0,00" value="' + esc(dec(preset.amount)) + '"><span>€</span></div></div>' +
      '<div class="field"><label>Tipo</label><div class="chips wrap">' + SPEND_CATS.map(c =>
        '<button class="chip' + (c === cat ? ' on' : '') + '" data-a="c" data-c="' + c + '">' + c + '</button>').join('') + '</div></div>' +
      whenField('s-at'),
    foot: '<button class="btn primary full" data-x="ok">Registra spesa</button>',
    mount(sh) {
      sh.addEventListener('click', e => {
        const el = e.target.closest('[data-a=c]'); if (!el) return;
        cat = el.dataset.c; $$('[data-a=c]', sh).forEach(x => x.classList.toggle('on', x === el)); haptic();
      });
      $('[data-x=ok]', sh).onclick = () => {
        const amount = parseNum($('#s-a', sh).value);
        if (!(amount > 0)) { toast('Manca l\'importo', 'err'); return; }
        const { undo } = Store.commit('Spesa', st => {
          Store.addEvent(st, { t: 'spend', at: ($('#s-at', sh).value || nowStamp()).slice(0, 16), amount: Math.round(amount * 100) / 100, cat, label: $('#s-l', sh).value.trim() || cat });
        });
        Sheet.close(); haptic(20);
        toast('Spesa registrata · ' + fmt.eur(amount), 'ok', undo);
      };
    }
  });
}

/* ============================================================ MODIFICA EVENTO */
export function editEvent(id) {
  const e = Store.event(id);
  if (!e) return;
  const A = analyze(Store.state);
  const D = A.D;
  const bottle = e.bid ? D.bottles.find(b => b.id === e.bid) : null;
  const p = e.pid ? D.prod.get(e.pid) : bottle ? D.prod.get(bottle.pid) : null;
  const T = { buy: 'Acquisto', refill: 'Rabbocco', level: 'Livello corretto', coil: 'Coil montata', spend: 'Spesa' }[e.t] || 'Evento';
  let fields = '';
  if (e.t === 'refill') fields = '<div class="field"><label>ml</label><div class="inp-suffix"><input class="inp num" id="e-ml" inputmode="decimal" value="' + dec(e.ml) + '"><span>ml</span></div></div>';
  if (e.t === 'buy') fields = '<div class="grid2"><div class="field"><label>Quante</label><input class="inp num" id="e-qty" inputmode="numeric" value="' + e.qty + '"></div>' +
    '<div class="field"><label>Prezzo totale</label><div class="inp-suffix"><input class="inp num" id="e-price" inputmode="decimal" value="' + dec(e.price) + '"><span>€</span></div></div></div>' +
    (p && p.kind !== 'coil' ? '<div class="field"><label>ml a boccetta</label><div class="inp-suffix"><input class="inp num" id="e-mlEach" inputmode="decimal" value="' + dec(e.mlEach) + '"><span>ml</span></div></div>' : '');
  if (e.t === 'spend') fields = '<div class="field"><label>Cosa</label><input class="inp" id="e-label" value="' + esc(e.label) + '"></div>' +
    '<div class="field"><label>Importo</label><div class="inp-suffix"><input class="inp num" id="e-amount" inputmode="decimal" value="' + dec(e.amount) + '"><span>€</span></div></div>';
  if (e.t === 'level') fields = '<div class="field"><label>ml rimasti</label><div class="inp-suffix"><input class="inp num" id="e-left" inputmode="decimal" value="' + dec(e.left) + '"><span>ml</span></div></div>';
  if (e.t === 'coil') fields = '<div class="grid2"><div class="field"><label>Watt</label><input class="inp num" id="e-watt" inputmode="decimal" value="' + dec(e.watt) + '"></div>' +
    '<div class="field"><label>Vita attesa</label><div class="inp-suffix"><input class="inp num" id="e-life" inputmode="decimal" value="' + dec(e.lifeMl) + '"><span>ml</span></div></div></div>';

  Sheet.open({
    title: T, sub: p ? fullName(p) : (e.label || ''),
    body: fields + whenField('e-at', e.at) +
      (e.est ? '<div class="note">Dato stimato (dalla vecchia app): conta nei totali ma non nelle medie al giorno.</div>' : '') +
      (e.t === 'spend' && e.review ? '<button class="btn full" data-x="conv" style="margin-top:12px">È un liquido: mettilo in scorta</button>' : ''),
    foot: '<div class="btn-row"><button class="btn danger" data-x="del">Elimina</button><button class="btn primary" data-x="ok">Salva</button></div>',
    mount(sh) {
      const g = id => $('#' + id, sh) ? parseNum($('#' + id, sh).value) : null;
      $('[data-x=ok]', sh).onclick = () => {
        const { undo } = Store.commit('Modifica', st => {
          const x = st.events.find(y => y.id === id);
          x.at = ($('#e-at', sh).value || x.at).slice(0, 16);
          if (x.t === 'refill') x.ml = g('e-ml');
          if (x.t === 'buy') { x.qty = Math.max(1, Math.round(g('e-qty'))); x.price = g('e-price'); if ($('#e-mlEach', sh)) x.mlEach = g('e-mlEach'); delete x.review; }
          if (x.t === 'spend') { x.amount = g('e-amount'); x.label = $('#e-label', sh).value; }
          if (x.t === 'level') x.left = g('e-left');
          if (x.t === 'coil') { x.watt = g('e-watt'); x.lifeMl = g('e-life'); }
        });
        Sheet.close(); toast('Salvato', 'ok', undo);
      };
      $('[data-x=del]', sh).onclick = () => {
        const warn = e.t === 'buy' ? ' Spariscono anche le boccette di questo acquisto.' : '';
        Sheet.close();
        setTimeout(() => confirmSheet('Eliminare?', T + ' del ' + fdate.day(e.at) + '.' + warn, 'Elimina', () => {
          const { undo } = Store.commit('Eliminato', st => { Store.removeEvent(st, id); st.review = st.review.filter(r => r.ref !== id); });
          toast('Eliminato', '', undo);
        }, true), 320);
      };
      const conv = $('[data-x=conv]', sh);
      if (conv) conv.onclick = () => { Sheet.close(); setTimeout(() => buy({ fromSpend: id }), 320); };
    }
  });
}

export { MG };

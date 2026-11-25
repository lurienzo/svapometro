/* ============================================================
   Svapometro v2 — modello dati

   Si salvano solo due cose: i PRODOTTI (le schede: cos'è un liquido, una coil…)
   e gli EVENTI (cosa è successo, con data e ora locale). Tutto il resto —
   boccette, livelli, spese, consumi, usura della coil — si CALCOLA rigiocando
   gli eventi in ordine. Così niente può andare fuori sincrono: cancellare un
   evento cancella tutti i suoi effetti.

   Eventi:
     buy    acquisto: pid, qty, mlEach, price (totale), draws? [{bid, ml}]
            (draws = basette/aromi presi dalla scorta, es. per allungare uno shot:
            si scalano e il loro costo passa alla boccetta nuova)
     refill rabbocco del pod: ml, bid (boccetta, può mancare), est?
     level  livello vero di una boccetta: bid, left, vaped (true = svapato senza
            segnarlo, false = perso/buttato), est?
     coil   coil montata: uid (unità dalla scorta, o null), watt, lifeMl, model
     spend  spesa libera senza scorta: amount, cat, label

   est = stima: conta nei totali ma non nelle medie al giorno (date incerte).
   ============================================================ */

export const SCHEMA = 2;

export const KINDS = {
  pronto:  { n: 'Liquido pronto', short: 'Pronto', vape: true,  bottle: true,  cat: 'liquidi' },
  shot:    { n: 'Shot / Mix&Vape', short: 'Shot', vape: true, bottle: true,  cat: 'liquidi' },
  aroma:   { n: 'Aroma concentrato', short: 'Aroma', vape: false, bottle: true, cat: 'fai da te' },
  basetta: { n: 'Basetta nicotina', short: 'Basetta', vape: false, bottle: true, cat: 'fai da te' },
  base:    { n: 'Base neutra', short: 'Base', vape: false, bottle: true, cat: 'fai da te' },
  coil:    { n: 'Resistenza', short: 'Coil', vape: false, bottle: false, cat: 'coil' },
  device:  { n: 'Dispositivo / pod', short: 'Hardware', vape: false, bottle: false, cat: 'hardware' },
  altro:   { n: 'Altro', short: 'Altro', vape: false, bottle: false, cat: 'altro' }
};

export const SPEND_CATS = ['liquidi', 'fai da te', 'coil', 'hardware', 'altro'];

export function emptyState() {
  return {
    schema: SCHEMA,
    settings: {
      switchDate: null,
      iqos: { sticksDay: 20, packPrice: 5.5, sticksPack: 20 },
      device: { name: '', podMl: 5 },
      coil: { model: 'GTX 0.8 Ω mesh', watt: 16, lifeMl: 40 },
      haptics: true
    },
    products: [],
    events: [],
    review: []
  };
}

/* ---------- id e date (sempre ora LOCALE: la v1 usava UTC e sbagliava giorno dopo mezzanotte) ---------- */
export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}
const p2 = n => String(n).padStart(2, '0');
export function localStamp(d) {
  d = d || new Date();
  return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()) + 'T' + p2(d.getHours()) + ':' + p2(d.getMinutes());
}
export function localDay(d) { return localStamp(d).slice(0, 10); }
/** '2026-11-24' o '2026-11-24T10:30' -> Date locale */
export function parseStamp(s) {
  if (!s) return new Date(NaN);
  const [day, time] = String(s).split('T');
  const [y, m, dd] = day.split('-').map(Number);
  const [hh, mm] = (time || '12:00').split(':').map(Number);
  return new Date(y, m - 1, dd, hh || 0, mm || 0);
}
export const dayOf = s => String(s || '').slice(0, 10);
export const monthOf = s => String(s || '').slice(0, 7);

/* ---------- rigioco degli eventi ---------- */
const EPS = 1e-6;
const round = v => Math.round(v * 1000) / 1000;

/**
 * Ricostruisce tutto dagli eventi. Restituisce:
 *  bottles   [{id, pid, ml, left, costPerMl, at, emptyAt, ev}]
 *  coilUnits [{id, pid, cost, at, mountedAt, removedAt, ml, watt, lifeMl, model}]
 *  spends    [{at, amount, cat, label, ev, pid}]
 *  uses      [{at, ml, bid, pid, est, vaped, kind:'refill'|'level'|'draw', cost}]
 *  warnings  [testo]
 */
export function derive(state) {
  const prod = new Map(state.products.map(p => [p.id, p]));
  const bottles = new Map();
  const coilUnits = new Map();
  const spends = [];
  const uses = [];
  const warnings = [];
  let mounted = null;

  const evs = state.events.map((e, i) => [e, i])
    .sort((a, b) => (a[0].at < b[0].at ? -1 : a[0].at > b[0].at ? 1 : a[1] - b[1]))
    .map(x => x[0]);

  const take = (b, ml, e, kind, vaped) => {
    const got = Math.min(b.left, ml);
    if (ml - got > 0.05) warnings.push('«' + nameOf(prod.get(b.pid)) + '»: tolti ' + round(ml) + ' ml ma ne restavano ' + round(b.left));
    b.left = round(b.left - got);
    if (b.left <= EPS && !b.emptyAt) b.emptyAt = e.at;
    uses.push({ at: e.at, ml: got, bid: b.id, pid: b.pid, mg: b.mg, est: !!e.est, vaped, kind, cost: got * b.costPerMl, ev: e.id });
    return got;
  };

  for (const e of evs) {
    if (e.t === 'buy') {
      const p = prod.get(e.pid);
      const k = KINDS[(p && p.kind) || 'altro'] || KINDS.altro;
      const qty = Math.max(1, +e.qty || 1);
      let drawCost = 0;
      for (const d of (e.draws || [])) {
        const b = bottles.get(d.bid);
        if (!b) { warnings.push('Acquisto ' + e.id + ': boccetta di origine sparita'); continue; }
        const before = uses.length;
        take(b, +d.ml || 0, e, 'draw', false);
        for (let i = before; i < uses.length; i++) drawCost += uses[i].cost;
      }
      const price = +e.price || 0;
      if (price > 0) {
        spends.push({ at: e.at, amount: price, cat: k.cat, label: nameOf(p), ev: e.id, pid: e.pid });
      }
      for (let i = 0; i < qty; i++) {
        const id = e.id + '.' + i;
        if (k.bottle) {
          const ml = +e.mlEach || (p && +p.ml) || 10;
          const mg = e.mg != null ? +e.mg : (p && p.mg != null ? +p.mg : null);
          bottles.set(id, { id, pid: e.pid, ml, left: ml, mg, costPerMl: ml > 0 ? (price + drawCost) / qty / ml : 0, at: e.at, emptyAt: null, ev: e.id });
        } else if (p && p.kind === 'coil') {
          coilUnits.set(id, { id, pid: e.pid, cost: price / qty, at: e.at, mountedAt: null, removedAt: null, ml: 0, watt: 0, lifeMl: 0, model: nameOf(p), ev: e.id });
        }
      }
    } else if (e.t === 'refill') {
      const ml = +e.ml || 0;
      const b = e.bid ? bottles.get(e.bid) : null;
      if (b) take(b, ml, e, 'refill', true);
      else uses.push({ at: e.at, ml, bid: null, pid: null, est: !!e.est, vaped: true, kind: 'refill', cost: 0, ev: e.id });
      if (mounted) mounted.ml = round(mounted.ml + ml);
    } else if (e.t === 'level') {
      const b = bottles.get(e.bid);
      if (!b) { warnings.push('Correzione su una boccetta che non esiste più'); continue; }
      const target = Math.max(0, +e.left || 0);
      if (target < b.left) take(b, b.left - target, e, 'level', e.vaped !== false);
      else if (target > b.left) { b.left = round(Math.min(b.ml, target)); if (b.left > EPS) b.emptyAt = null; }
    } else if (e.t === 'coil') {
      if (mounted) mounted.removedAt = e.at;
      let u = e.uid ? coilUnits.get(e.uid) : null;
      if (u && u.mountedAt) { warnings.push('Coil montata due volte'); u = null; }
      if (!u) {
        u = { id: e.id + '.c', pid: null, cost: 0, at: e.at, mountedAt: null, removedAt: null, ml: 0, model: e.model || 'Coil', ev: e.id };
        coilUnits.set(u.id, u);
      }
      u.mountedAt = e.at;
      u.removedAt = null;
      u.watt = +e.watt || 0;
      u.lifeMl = +e.lifeMl || 40;
      u.model = e.model || u.model;
      u.mountEv = e.id;
      mounted = u;
    } else if (e.t === 'spend') {
      spends.push({ at: e.at, amount: +e.amount || 0, cat: e.cat || 'altro', label: e.label || '', ev: e.id, pid: null, review: !!e.review });
    }
  }
  return {
    prod,
    bottles: [...bottles.values()],
    coilUnits: [...coilUnits.values()],
    mounted,
    spends,
    uses,
    warnings,
    events: evs
  };
}

export function nameOf(p) { return fullName(p); }

/** «Booms Ice» se la linea è Booms; «Extra Dry 4Pod · Burley» altrimenti */
export function fullName(p) {
  if (!p) return '—';
  if (!p.line) return p.name;
  if (p.name.toLowerCase().indexOf(p.line.toLowerCase()) >= 0) return p.name;
  return p.line + ' ' + p.name;
}

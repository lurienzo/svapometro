/* ============================================================
   Conversione dei backup della v1 (app Android) nel formato v2.

   Regole:
   - nessun dato si perde: ogni euro della v1 resta, ogni voto resta;
   - quello che la v1 aveva in due posti (spesa + acquisto) diventa UN acquisto;
   - quello che non si può decidere da soli finisce in state.review, e lo
     sistema dall'app («Da sistemare»).
   ============================================================ */
import { SCHEMA, emptyState, uid } from './model.js';

export function isV1(o) {
  const d = o && o.data ? o.data : o;
  return !!(d && Array.isArray(d.liquids) && Array.isArray(d.expenses) && !d.schema);
}

const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const r2 = v => Math.round(v * 100) / 100;
const r1 = v => Math.round(v * 10) / 10;
const fmtEur = v => r2(v).toFixed(2).replace('.', ',') + ' €';

function kindOf(l) {
  if (l.kind === 'nicotina') return 'basetta';
  if (l.kind === 'aroma') return 'aroma';
  if (l.kind === 'base') return 'base';
  return /shot|mix/i.test(l.type || '') ? 'shot' : 'pronto';
}

const CAT = { liquidi: 'liquidi', aromi: 'fai da te', basette: 'fai da te', basi: 'fai da te',
  coil: 'coil', device: 'hardware', accessori: 'hardware', altro: 'altro' };

export function migrateV1(input) {
  const d = input && input.data ? input.data : input;
  const st = emptyState();
  const review = [];
  const say = (kind, text, ref) => review.push({ id: uid(), kind, text, ref: ref || null });
  const ev = [];
  const add = e => { ev.push(e); return e; };

  /* ---- impostazioni ---- */
  const s1 = d.settings || {};
  st.settings.switchDate = s1.switchDate || null;
  if (s1.iqos) Object.assign(st.settings.iqos, s1.iqos);
  if (s1.device) Object.assign(st.settings.device, s1.device);
  const lastCoil = (d.coils || []).slice(-1)[0];
  if (lastCoil) st.settings.coil = { model: lastCoil.model, watt: +lastCoil.watt || 16, lifeMl: +lastCoil.expectedMl || 40 };
  const podMl = +st.settings.device.podMl || 5;

  /* ---- prodotti ---- */
  for (const l of d.liquids || []) {
    const p = {
      id: l.id, kind: kindOf(l), name: String(l.name || '').trim(), brand: String(l.brand || '').trim(), line: '',
      ml: +l.ml || 10, mg: l.nic !== '' && l.nic != null && !isNaN(parseFloat(l.nic)) ? parseFloat(l.nic) : null,
      rating: l.rating || null, notes: l.notes || '', catRef: null, added: l.date || null
    };
    if (p.brand && norm(p.brand) === norm(p.name)) {
      say('info', '«' + p.name + '»: la marca era uguale al nome, l\'ho tolta. Se la sai, aggiungila.', p.id);
      p.brand = '';
    }
    const taste = {};
    if (l.sweet != null && +l.sweet !== 3) taste.sweet = +l.sweet;
    if (l.throat != null && +l.throat !== 3) taste.throat = +l.throat;
    if (l.coilkill != null && +l.coilkill !== 3) taste.coilkill = +l.coilkill;
    if (Object.keys(taste).length) p.taste = taste;
    st.products.push(p);
  }
  const prodById = new Map(st.products.map(p => [p.id, p]));

  /* ---- spese e acquisti: uno solo ---- */
  const expenses = (d.expenses || []).map(e => Object.assign({ used: false }, e));
  const buysByLiquid = new Map();       // lid -> [{buy, bottles:[{bid, left, at}]}]

  for (const l of d.liquids || []) {
    const list = [];
    const purchases = (l.purchases || []).slice().sort((a, b) => (a.date < b.date ? -1 : 1));
    for (const pu of purchases) {
      const qty = Math.max(1, +pu.qty || 1);
      const mlEach = +pu.mlEach || +l.ml || 10;
      const want = +pu.price || 0;
      // 1) spesa collegata con lo stesso importo
      let ex = expenses.find(e => !e.used && e.liquidId === l.id && Math.abs((+e.amount || 0) - want) < 0.01);
      // 2) spesa collegata qualunque
      if (!ex) ex = expenses.find(e => !e.used && e.liquidId === l.id);
      // 3) spesa scollegata con lo stesso nome e importo, entro 10 giorni
      let guessed = false;
      if (!ex && want > 0) {
        ex = expenses.find(e => !e.used && !e.liquidId && Math.abs((+e.amount || 0) - want) < 0.01 &&
          (norm(e.label).indexOf(norm(l.name)) >= 0 || norm(l.name).indexOf(norm(e.label)) >= 0 ||
           norm(e.label).split(' ').some(w => w.length > 3 && norm(l.name).split(' ').indexOf(w) >= 0)) &&
          Math.abs(new Date(e.date) - new Date(pu.date)) <= 10 * 86400000);
        guessed = !!ex;
      }
      let price = 0, date = pu.date;
      if (ex) {
        ex.used = true;
        price = +ex.amount || 0;
        date = ex.date < pu.date ? ex.date : pu.date;
        if (guessed) say('info', '«' + l.name + '»: ho collegato la spesa «' + ex.label + '» del ' + ex.date + ' (' + fmtEur(price) + ') all\'acquisto.', l.id);
      } else if (want > 0) {
        say('ask', '«' + l.name + '»: acquisto del ' + pu.date + ' con prezzo ' + fmtEur(want) +
          ' che nella v1 non era fra le spese. L\'ho messo a 0 €: se l\'hai pagato, correggi il prezzo.', l.id);
      }
      const b = add({ id: 'v1' + (pu.id || uid()), t: 'buy', at: date + 'T09:00', pid: l.id, qty, mlEach, price: r2(price) });
      const bottles = [];
      for (let i = 0; i < qty; i++) bottles.push({ bid: b.id + '.' + i, left: mlEach, ml: mlEach, at: date });
      list.push({ buy: b, bottles });
    }
    buysByLiquid.set(l.id, list);
  }

  /* ---- coil: acquisti nella scorta, montaggi come eventi ---- */
  const coilProd = { id: 'v1coil', kind: 'coil', name: lastCoil ? lastCoil.model : 'Coil', brand: 'Vaporesso', line: '', ml: 0, mg: null, rating: null, notes: '', catRef: null };
  const coilUnits = [];
  for (const e of expenses.filter(x => !x.used && x.cat === 'coil')) {
    e.used = true;
    const qty = Math.max(1, +e.qty || 1);
    const b = add({ id: 'v1' + e.id, t: 'buy', at: e.date + 'T09:00', pid: coilProd.id, qty, mlEach: 0, price: r2(+e.amount || 0) });
    for (let i = 0; i < qty; i++) coilUnits.push({ uid: b.id + '.' + i, at: e.date });
  }
  const coils = (d.coils || []).slice().sort((a, b) => (a.installed < b.installed ? -1 : 1));
  if (coils.length || coilUnits.length) st.products.push(coilProd);
  let noStock = 0, noStockEur = 0;
  coils.forEach((c, i) => {
    const u = coilUnits.find(x => !x.taken && x.at <= c.installed) || coilUnits.find(x => !x.taken);
    if (u) u.taken = true; else { noStock++; noStockEur += +c.price || 0; }
    const prev = coils[i - 1];
    const busy = prev && (prev.refills || []).some(f => f.d === c.installed);
    add({ id: 'v1' + c.id, t: 'coil', at: c.installed + (busy ? 'T20:00' : 'T08:0' + Math.min(9, i)), uid: u ? u.uid : null,
      model: c.model, watt: +c.watt || 0, lifeMl: +c.expectedMl || 40 });
    const next = coils[i + 1];
    if (next && c.removed && next.installed < c.removed) {
      say('info', 'Coil montata il ' + c.installed + ': la v1 la dava tolta il ' + c.removed +
        ', ma la successiva è montata il ' + next.installed + '. Ora conta tolta il ' + next.installed + '.', null);
    }
  });
  if (noStock) {
    say('ask', noStock + ' coil montate non hanno un acquisto fra le spese (la v1 le prezzava ' + fmtEur(noStockEur) +
      ' in tutto, ma fuori dal totale). Se le hai comprate a parte, registra l\'acquisto; forse sono nella spesa da 80 € del 9/11.', null);
  }

  /* ---- spese rimaste: spese libere ---- */
  for (const e of expenses.filter(x => !x.used)) {
    const isLiquid = e.cat === 'liquidi' || e.cat === 'aromi' || e.cat === 'basette' || e.cat === 'basi';
    const s = add({ id: 'v1' + e.id, t: 'spend', at: e.date + 'T09:00', amount: r2(+e.amount || 0), cat: CAT[e.cat] || 'altro',
      label: e.label || '', note: e.note || '' });
    if (isLiquid) {
      s.review = true;
      say('ask', 'Spesa «' + e.label + '» del ' + e.date + ' (' + fmtEur(e.amount) + '): non è collegata a nessun liquido, quindi non è in scorta. Dimmi cos\'era.', s.id);
    }
  }

  /* ---- rabbocchi oltre il comprato: manca un acquisto ---- */
  const refills = [];
  for (const c of d.coils || []) for (const f of (c.refills || [])) refills.push(Object.assign({ coilInstalled: c.installed }, f));
  refills.sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0));
  for (const l of d.liquids || []) {
    const list = buysByLiquid.get(l.id) || [];
    const bought = list.flatMap(x => x.bottles).reduce((a, b) => a + b.ml, 0);
    const mine = refills.filter(f => f.lid === l.id);
    const refilled = mine.reduce((a, f) => a + (+f.ml || 0), 0);
    if (refilled <= bought + 0.05) continue;
    const p = prodById.get(l.id);
    const miss = refilled - bought;
    const size = p.ml || 10;
    const mlEach = Math.ceil(miss / size - 1e-9) * size;
    const at = list.length ? list[0].buy.at : mine[0].d + 'T09:00';
    const b = add({ id: 'v1x' + l.id, t: 'buy', at, pid: l.id, qty: 1, mlEach, price: 0, review: true });
    list.push({ buy: b, bottles: [{ bid: b.id + '.0', ml: mlEach, left: mlEach, at: at.slice(0, 10) }] });
    buysByLiquid.set(l.id, list);
    say('ask', '«' + l.name + '»: rabbocchi per ' + r1(refilled) + ' ml ma acquisti per ' + r1(bought) +
      ' ml. Ho aggiunto una boccetta da ' + mlEach + ' ml a 0 €: correggi quantità e prezzo se te li ricordi.', l.id);
  }

  /* ---- rabbocchi: dalla boccetta più vecchia ancora piena ---- */
  const pickBottle = (lid, date, ml) => {
    const list = buysByLiquid.get(lid) || [];
    const all = list.flatMap(x => x.bottles);
    const avail = all.filter(x => x.left > 0.05 && x.at <= date);
    const pool = avail.length ? avail : all.filter(x => x.left > 0.05);
    // la più vecchia che basta; se nessuna basta, quella che ne ha di più
    let b = pool.find(x => x.left >= ml - 0.05) || pool.slice().sort((x, y) => y.left - x.left)[0];
    if (!b) return null;
    b.left = Math.max(0, b.left - ml);
    return b.bid;
  };
  const perDay = {};
  const lastUse = {};
  for (const f of refills) {
    const ml = +f.ml || 0;
    const n = perDay[f.d] = (perDay[f.d] || 0) + 1;
    // il giorno del cambio coil: prima i rabbocchi della vecchia, poi il montaggio (20:00), poi quelli della nuova
    const onNew = f.coilInstalled === f.d;
    const at = f.d + 'T' + (onNew ? '21:' + String(Math.min(59, n)).padStart(2, '0')
      : String(Math.min(19, 10 + n)).padStart(2, '0') + ':00');
    const big = ml > podMl * 1.5;
    const bid = f.lid ? pickBottle(f.lid, f.d, ml) : null;
    add({ id: 'v1' + (f.id || uid()), t: 'refill', at, ml, bid, est: big || !f.lid || undefined });
    if (f.lid) lastUse[f.lid] = f.d;
    if (big) say('info', 'Rabbocco da ' + r1(ml) + ' ml del ' + f.d + ': troppo per un pod da ' + podMl +
      ' ml, sembra una correzione. Conta per la coil e nel totale, non nella media al giorno.', null);
  }

  /* ---- livelli: riallinea le boccette a quanto diceva la v1 ---- */
  for (const l of d.liquids || []) {
    const list = buysByLiquid.get(l.id) || [];
    const all = list.flatMap(x => x.bottles);
    // la giacenza secondo la v1, coi suoi acquisti originali
    const bought = (l.purchases || []).reduce((a, pu) => a + Math.max(1, +pu.qty || 1) * (+pu.mlEach || +l.ml || 10), 0);
    const v1left = Math.max(0, bought - (+l.consumed || 0) + (+l.adjust || 0));
    let left = all.reduce((a, b) => a + b.left, 0);
    const p = prodById.get(l.id);
    if (left > v1left + 0.05) {
      // il resto lo togliamo dalle boccette più vecchie
      let toGo = left - v1left;
      const day = lastUse[l.id] || (list.length ? list[list.length - 1].buy.at.slice(0, 10) : '2026-09-01');
      for (const b of all) {
        if (toGo <= 0.05) break;
        if (b.left <= 0.05) continue;
        const cut = Math.min(b.left, toGo);
        add({ id: 'v1l' + b.bid, t: 'level', at: day + 'T23:30', bid: b.bid, left: r1(b.left - cut), vaped: p.kind === 'pronto' || p.kind === 'shot', est: true });
        b.left -= cut;
        toGo -= cut;
      }
      const gone = r1(left - v1left);
      if (p.kind === 'pronto' || p.kind === 'shot') {
        say('info', '«' + l.name + '»: ' + gone + ' ml svapati senza rabbocco registrato (dalla v1). Contano nel totale, non nella media al giorno.', l.id);
      } else {
        say('info', '«' + l.name + '»: ' + gone + ' ml usati (dalla v1), probabilmente per allungare uno shot.', l.id);
      }
    } else if (v1left > left + 0.05) {
      say('ask', '«' + l.name + '»: la v1 diceva ' + r1(v1left) + ' ml rimasti, ma dagli acquisti e dai rabbocchi ne restano ' +
        r1(left) + '. Controlla la boccetta e correggi il livello.', l.id);
    }
  }

  st.events = ev;
  st.review = review;
  st.migratedFrom = { app: 'svapometro v1', exported: (input && input.exported) || null, at: new Date().toISOString() };
  return st;
}

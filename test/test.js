/* Collaudo dei conti, senza telefono: node test/test.js
   Usa il backup vero se c'è (web/.private/backup-v1.json, fuori dal repository). */
import fs from 'fs';
import { emptyState, derive, localStamp, parseStamp } from '../js/model.js';
import { migrateV1, isV1 } from '../js/migrate.js';
import { analyze, bottlesOf, stockByProduct } from '../js/calc.js';

let pass = 0, fail = 0;
const ok = (c, msg) => { if (c) pass++; else { fail++; console.error('✗ ' + msg); } };
const near = (a, b, msg, eps) => ok(Math.abs(a - b) < (eps || 0.011), msg + ' (' + a + ' ≠ ' + b + ')');

/* ---- date locali ---- */
{
  const d = new Date(2026, 10, 25, 0, 30);
  ok(localStamp(d) === '2026-11-25T00:30', 'dopo mezzanotte resta il giorno giusto (la v1 usava UTC)');
  ok(parseStamp('2026-11-25T00:30').getDate() === 25, 'parseStamp locale');
}

/* ---- un mondo piccolo, a mano ---- */
{
  const st = emptyState();
  st.settings.switchDate = '2026-11-01';
  st.settings.iqos = { sticksDay: 20, packPrice: 5, sticksPack: 20 };
  st.products.push({ id: 'L', kind: 'pronto', name: 'Liquido', brand: 'X', ml: 10, mg: 8 });
  st.products.push({ id: 'C', kind: 'coil', name: 'GTX', brand: '', ml: 0 });
  st.products.push({ id: 'N', kind: 'basetta', name: 'Basetta', brand: '', ml: 10, mg: 20 });
  st.products.push({ id: 'S', kind: 'shot', name: 'Shot', brand: '', ml: 20, mg: 8 });
  st.events.push({ id: 'b1', t: 'buy', at: '2026-11-01T10:00', pid: 'L', qty: 2, mlEach: 10, price: 14 });
  st.events.push({ id: 'b2', t: 'buy', at: '2026-11-01T10:00', pid: 'C', qty: 5, mlEach: 0, price: 15 });
  st.events.push({ id: 'k1', t: 'coil', at: '2026-11-01T11:00', uid: 'b2.0', watt: 16, lifeMl: 40 });
  st.events.push({ id: 'r1', t: 'refill', at: '2026-11-02T10:00', ml: 5, bid: 'b1.0' });
  st.events.push({ id: 'r2', t: 'refill', at: '2026-11-03T10:00', ml: 5, bid: 'b1.0' });
  st.events.push({ id: 'r3', t: 'refill', at: '2026-11-04T10:00', ml: 3, bid: 'b1.1' });
  st.events.push({ id: 'k2', t: 'coil', at: '2026-11-05T09:00', uid: 'b2.1', watt: 16, lifeMl: 40 });
  st.events.push({ id: 'r4', t: 'refill', at: '2026-11-05T10:00', ml: 2, bid: 'b1.1' });
  st.events.push({ id: 'l1', t: 'level', at: '2026-11-06T10:00', bid: 'b1.1', left: 4, vaped: false });
  st.events.push({ id: 'b3', t: 'buy', at: '2026-11-06T10:00', pid: 'N', qty: 2, mlEach: 10, price: 5 });
  st.events.push({ id: 'b4', t: 'buy', at: '2026-11-07T10:00', pid: 'S', qty: 1, mlEach: 20, price: 7, draws: [{ bid: 'b3.0', ml: 8 }] });
  st.events.push({ id: 's1', t: 'spend', at: '2026-11-07T10:00', amount: 3, cat: 'hardware', label: 'pod' });

  const now = new Date(2026, 10, 11, 10, 0);
  const A = analyze(st, now);
  near(A.spent, 14 + 15 + 5 + 7 + 3, 'la spesa è la somma di acquisti e spese, una volta sola');
  near(A.byCat.coil, 15, 'le coil si pagano quando le compri, non quando le monti');
  ok(A.coilSpare.length === 3, 'scorta coil: 5 comprate, 2 montate → 3');
  near(A.coil.ml, 2, 'la coil nuova conta solo i rabbocchi dopo il montaggio');
  near(A.coilDone[0].ml, 13, 'la coil vecchia ha fatto 13 ml');
  const b0 = A.D.bottles.find(b => b.id === 'b1.0'), b1 = A.D.bottles.find(b => b.id === 'b1.1');
  near(b0.left, 0, 'prima boccetta finita');
  near(b1.left, 4, 'seconda boccetta: 10 − 3 − 2 − 1 perso = 4');
  near(A.mlTotal, 15, 'svapati: solo rabbocchi, la perdita non conta');
  near(b1.ml, 10, 'la barra usa la capienza vera della boccetta');
  const shot = A.D.bottles.find(b => b.id === 'b4.0');
  near(shot.costPerMl, (7 + 8 * 0.25) / 20, 'lo shot allungato costa shot + basetta usata');
  near(A.D.bottles.find(b => b.id === 'b3.0').left, 2, 'la basetta usata per lo shot si scala');
  near(A.stockValue, 4 * 0.7 + 20 * shot.costPerMl, 'valore in scorta al prezzo pagato per ogni boccetta');
  near(A.iqosCost, (10 + 10 / 24) * 5, '10 giorni e 10 ore di IQOS a 5 € al giorno');
  ok(A.D.warnings.length === 0, 'nessun avviso: ' + A.D.warnings.join('; '));
  ok(bottlesOf(A.D, 'L')[0].id === 'b1.1', 'la boccetta aperta viene proposta per prima');

  // cancellare un evento cancella i suoi effetti
  const st2 = JSON.parse(JSON.stringify(st));
  st2.events = st2.events.filter(e => e.id !== 'b4');
  const A2 = analyze(st2, now);
  near(A2.D.bottles.find(b => b.id === 'b3.0').left, 10, 'tolto l\'acquisto dello shot, la basetta torna piena');
  near(A2.spent, A.spent - 7, 'e la spesa scende di 7 €');

  // rabbocco oltre il contenuto: avviso, mai livelli negativi
  st2.events.push({ id: 'r9', t: 'refill', at: '2026-11-08T10:00', ml: 9, bid: 'b1.1' });
  const A3 = analyze(st2, now);
  ok(A3.D.bottles.find(b => b.id === 'b1.1').left === 0 && A3.D.warnings.length === 1, 'oltre il fondo: zero e un avviso');
}

/* ---- conversione del backup vero ---- */
const path = new URL('../.private/backup-v1.json', import.meta.url);
if (fs.existsSync(path)) {
  const raw = JSON.parse(fs.readFileSync(path, 'utf8'));
  ok(isV1(raw), 'riconosce il backup v1');
  const st = migrateV1(raw);
  const A = analyze(st, new Date(2026, 10, 25, 12));
  const v1spent = raw.data.expenses.reduce((a, e) => a + (+e.amount || 0), 0);
  near(A.spent, v1spent, 'ogni euro della v1 resta');
  ok(A.D.warnings.length === 0, 'conversione senza avvisi: ' + A.D.warnings.join('; '));
  for (const l of raw.data.liquids) {
    const p = st.products.find(x => x.id === l.id);
    ok(p && p.rating === (l.rating || null), 'voto di «' + l.name + '» intatto');
  }
  // giacenza: uguale a quella della v1, liquido per liquido
  const stock = stockByProduct(A.D);
  for (const l of raw.data.liquids) {
    const bought = (l.purchases || []).reduce((a, pu) => a + (pu.qty || 1) * (pu.mlEach || l.ml || 10), 0);
    const v1 = Math.max(0, bought - (l.consumed || 0) + (l.adjust || 0));
    const v2 = (stock.get(l.id) || { ml: 0 }).ml;
    near(v2, v1, 'giacenza di «' + l.name + '» come nella v1', 0.06);
  }
  ok(A.coil && A.coil.ml === 0, 'la coil montata il 24/11 riparte da zero (il rabbocco da 30 ml era della vecchia)');
  ok(st.review.some(r => /80,00/.test(r.text)), 'la spesa da 80 € finisce fra le cose da sistemare');
} else console.log('(backup vero assente: salto la conversione)');

console.log((fail ? '✗ ' : '✓ ') + pass + ' verifiche passate' + (fail ? ', ' + fail + ' fallite' : ''));
process.exit(fail ? 1 : 0);

/* ============================================================
   Conti: tutto parte da derive(state), niente si salva a parte.
   ============================================================ */
import { KINDS, derive, parseStamp, dayOf, monthOf, localDay } from './model.js';

const DAY = 86400000;
const sum = (a, f) => a.reduce((t, x) => t + (f ? f(x) : x), 0);

export function analyze(state, now) {
  now = now || new Date();
  const D = derive(state);
  const S = state.settings;
  const kindOf = pid => (D.prod.get(pid) || {}).kind;
  const vapeable = pid => { const k = KINDS[kindOf(pid)]; return !!(k && k.vape); };

  /* ---- IQOS evitate ---- */
  const start = S.switchDate ? parseStamp(S.switchDate + 'T00:00') : null;
  const daysOff = start ? Math.max(0, (now - start) / DAY) : 0;
  const iq = S.iqos || {};
  const iqosDay = (+iq.sticksDay || 0) / (+iq.sticksPack || 20) * (+iq.packPrice || 0);
  const iqosCost = daysOff * iqosDay;
  const sticks = daysOff * (+iq.sticksDay || 0);

  /* ---- spese ---- */
  const spent = sum(D.spends, s => s.amount);
  const oneOff = sum(D.spends.filter(s => s.cat === 'hardware'), s => s.amount);
  const byCat = {};
  for (const s of D.spends) byCat[s.cat] = (byCat[s.cat] || 0) + s.amount;
  const byMonth = {};
  for (const s of D.spends) { const m = monthOf(s.at); byMonth[m] = (byMonth[m] || 0) + s.amount; }

  /* ---- scorte ---- */
  const live = D.bottles.filter(b => b.left > 0.05);
  const stockVape = live.filter(b => vapeable(b.pid));
  const stockMl = sum(stockVape, b => b.left);
  const stockValue = sum(stockVape, b => b.left * b.costPerMl);
  const coilSpare = D.coilUnits.filter(u => !u.mountedAt);

  /* ---- consumo: solo rabbocchi con data vera ---- */
  const vaped = D.uses.filter(u => u.vaped && (u.kind === 'refill' || u.kind === 'level'));
  const mlTotal = sum(vaped, u => u.ml);
  const refills = D.uses.filter(u => u.kind === 'refill' && !u.est);
  const firstRefill = refills.length ? parseStamp(refills[0].at) : null;
  const rate = (days) => {
    if (!firstRefill) return null;
    const from = new Date(now.getTime() - days * DAY);
    const span = Math.min(days, (now - firstRefill) / DAY);
    if (span < 2) return null;
    const ml = sum(refills.filter(u => parseStamp(u.at) >= from), u => u.ml);
    return ml / span;
  };
  const ml7 = rate(7), ml30 = rate(30);
  // se registri pochi rabbocchi la media dei rabbocchi mente: allora uso tutto lo svapato
  const firstVape = vaped.length ? parseStamp(vaped.map(u => u.at).sort()[0]) : null;
  const vapeSpan = firstVape ? (now - firstVape) / DAY : 0;
  const mlDayAll = vapeSpan >= 2 ? mlTotal / vapeSpan : null;
  const recentN = refills.filter(u => parseStamp(u.at) >= new Date(now - 30 * DAY)).length;
  const sparse = recentN < 10;
  const mlDay = !sparse && ml30 != null ? ml30 : (mlDayAll != null ? mlDayAll : ml30);

  /* nicotina: ml × mg del liquido */
  // nicotina: media pesata dei mg dei liquidi rabboccati negli ultimi 30 giorni × ml al giorno
  const nicRefills = refills.filter(u => u.mg != null && parseStamp(u.at) >= new Date(now - 30 * DAY));
  const nicMl = sum(nicRefills, u => u.ml);
  const mgAvg = nicMl > 0 ? sum(nicRefills, u => u.ml * u.mg) / nicMl : null;
  const mgDay = mgAvg != null && mlDay ? mgAvg * mlDay : null;

  /* costo vero di quello che hai svapato */
  const vapedCost = sum(vaped, u => u.cost);
  const vapedPriced = sum(vaped.filter(u => u.bid), u => u.ml);
  const eurMl = vapedPriced > 0 ? vapedCost / vapedPriced : null;

  /* ---- coil ---- */
  const cur = D.mounted;
  const done = D.coilUnits.filter(u => u.mountedAt && u.removedAt);
  const lifeDays = u => (parseStamp(u.removedAt || localDay(now)) - parseStamp(u.mountedAt)) / DAY;
  const coilAvgMl = done.length ? sum(done, u => u.ml) / done.length : null;
  const coilAvgDays = done.length ? sum(done, lifeDays) / done.length : null;
  const coil = cur ? {
    unit: cur,
    ml: cur.ml,
    lifeMl: cur.lifeMl || S.coil.lifeMl || 40,
    pct: Math.min(150, cur.ml / (cur.lifeMl || 40) * 100),
    days: Math.max(0, (now - parseStamp(cur.mountedAt)) / DAY),
    leftDays: mlDay ? Math.max(0, ((cur.lifeMl || 40) - cur.ml) / mlDay) : null
  } : null;

  /* ---- spese al mese: media sugli ultimi 30 giorni, senza hardware ---- */
  const from30 = new Date(now - 30 * DAY);
  const recent = sum(D.spends.filter(s => s.cat !== 'hardware' && parseStamp(s.at) >= from30), s => s.amount);
  const span30 = start ? Math.min(30, daysOff) : 30;
  const monthPace = span30 >= 3 ? recent / span30 * 30.44 : null;

  /* ---- quanto durano le scorte ---- */
  const stockDays = mlDay ? stockMl / mlDay : null;
  const coilStockDays = coilAvgDays != null ? coilSpare.length * coilAvgDays : null;

  return {
    D, now,
    daysOff, iqosDay, iqosCost, sticks,
    spent, oneOff, byCat, byMonth, savings: iqosCost - spent,
    stockMl, stockValue, stockVape, live, coilSpare,
    mlTotal, ml7, ml30, mlDay, mlDayAll, sparse, recentN, mgDay, mgAvg, eurMl, vapedCost,
    coil, coilAvgMl, coilAvgDays, coilDone: done,
    monthPace, stockDays, coilStockDays
  };
}

/** boccette di un prodotto: prima l'aperta, poi le piene, poi le finite */
export function bottlesOf(D, pid) {
  const rank = b => (b.left <= 0.05 ? 2 : b.left < b.ml - 0.05 ? 0 : 1);
  return D.bottles.filter(b => b.pid === pid)
    .sort((a, b) => rank(a) - rank(b) || (a.at < b.at ? -1 : 1));
}

/** ml rimasti e numero di boccette per prodotto */
export function stockByProduct(D) {
  const m = new Map();
  for (const b of D.bottles) {
    if (b.left <= 0.05) continue;
    const x = m.get(b.pid) || { ml: 0, n: 0, open: 0 };
    x.ml += b.left; x.n++;
    if (b.left < b.ml - 0.05) x.open++;
    m.set(b.pid, x);
  }
  return m;
}

/** serie mensile ml svapati (solo rabbocchi datati) */
export function mlByMonth(D, n, now) {
  now = now || new Date();
  const map = {};
  for (const u of D.uses) if (u.kind === 'refill' && !u.est) map[monthOf(u.at)] = (map[monthOf(u.at)] || 0) + u.ml;
  return monthsBack(n, now).map(ym => ({ ym, v: map[ym] || 0 }));
}

export function monthsBack(n, now) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'));
  }
  return out;
}

/** ml al giorno negli ultimi n giorni, per il grafico */
export function mlByDay(D, n, now) {
  now = now || new Date();
  const map = {};
  for (const u of D.uses) if (u.kind === 'refill' && !u.est) map[dayOf(u.at)] = (map[dayOf(u.at)] || 0) + u.ml;
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const k = localDay(d);
    out.push({ day: k, v: map[k] || 0 });
  }
  return out;
}

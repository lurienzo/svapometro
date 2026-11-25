/* ============================================================
   Attrezzi dell'interfaccia: formattazione, fogli dal basso, avvisi, cursori.
   ============================================================ */
import { parseStamp, localDay, localStamp } from './model.js';

export const $ = (s, r) => (r || document).querySelector(s);
export const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));

export function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** un solo ascoltatore per contenitore: data-a="azione" sugli elementi */
export function on(root, handlers) {
  root.addEventListener('click', e => {
    const t = e.target.closest('[data-a]');
    if (!t || !root.contains(t)) return;
    const f = handlers[t.dataset.a];
    if (f) { e.preventDefault(); f(t, e); }
  });
}

/* ---------- numeri ---------- */
const nf = {};
const NF = d => nf[d] || (nf[d] = new Intl.NumberFormat('it-IT', { minimumFractionDigits: d, maximumFractionDigits: d }));
export const fmt = {
  n: (v, d) => NF(d || 0).format(+v || 0),
  n1: v => { const x = Math.round((+v || 0) * 10) / 10; return NF(x % 1 ? 1 : 0).format(x); },
  eur: v => NF(2).format(+v || 0) + ' €',
  eur0: v => NF(0).format(Math.round(+v || 0)) + ' €',
  ml: v => fmt.n1(v) + ' ml',
  pct: v => NF(0).format(+v || 0) + '%'
};
export function parseNum(v) {
  if (typeof v === 'number') return v;
  const n = parseFloat(String(v == null ? '' : v).replace(/\s/g, '').replace(',', '.'));
  return isNaN(n) ? 0 : n;
}
export const dec = v => (v === '' || v == null ? '' : String(Math.round(v * 100) / 100).replace('.', ','));

/* ---------- date ---------- */
const MESI = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
const MESI_L = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
export const fdate = {
  day(s) {
    if (!s) return '—';
    const d = parseStamp(s);
    const today = localDay(new Date());
    const yest = localDay(new Date(Date.now() - 86400000));
    const k = String(s).slice(0, 10);
    if (k === today) return 'oggi';
    if (k === yest) return 'ieri';
    return d.getDate() + ' ' + MESI[d.getMonth()] + (d.getFullYear() !== new Date().getFullYear() ? ' ' + d.getFullYear() : '');
  },
  long(s) {
    const d = parseStamp(s);
    const w = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'][d.getDay()];
    const k = fdate.day(s);
    return (k === 'oggi' || k === 'ieri' ? k + ', ' : '') + w + ' ' + d.getDate() + ' ' + MESI_L[d.getMonth()];
  },
  time(s) { return String(s || '').slice(11, 16); },
  month(ym) { const [y, m] = ym.split('-'); return MESI_L[+m - 1] + ' ' + y; },
  monthShort(ym) { return MESI[+ym.split('-')[1] - 1]; },
  ago(s) {
    const d0 = parseStamp(String(s).slice(0, 10)), t = new Date();
    const days = Math.round((new Date(t.getFullYear(), t.getMonth(), t.getDate()) - d0) / 86400000);
    if (days <= 0) return 'oggi';
    if (days === 1) return 'ieri';
    if (days < 30) return days + ' giorni fa';
    return fdate.day(s);
  },
  days(n) {
    if (n == null) return '—';
    const d = Math.round(n);
    if (d < 1) return 'meno di un giorno';
    if (d === 1) return '1 giorno';
    if (d < 60) return d + ' giorni';
    return Math.round(d / 30.44) + ' mesi';
  }
};
export { localStamp, localDay };

/* ---------- vibrazione (Android sì, iPhone no: Safari non la espone) ---------- */
export function haptic(ms) {
  try {
    if (window.Android && window.Android.vibrate) window.Android.vibrate(ms || 12);
    else if (navigator.vibrate) navigator.vibrate(ms || 12);
  } catch (e) { }
}

/* ---------- avvisi ---------- */
export function toast(msg, kind, undo) {
  const r = $('#toast-root');
  const d = document.createElement('div');
  d.className = 'toast' + (kind ? ' ' + kind : '');
  const span = document.createElement('span');
  span.textContent = msg;
  d.appendChild(span);
  let gone = false;
  const hide = () => {
    if (gone) return; gone = true;
    d.style.transition = 'opacity .25s, transform .25s'; d.style.opacity = '0'; d.style.transform = 'translateY(6px)';
    setTimeout(() => d.remove(), 260);
  };
  if (undo) {
    const b = document.createElement('button');
    b.textContent = 'Annulla';
    b.onclick = () => { hide(); if (undo()) toast('Annullato'); else toast('Non si può più annullare', 'err'); };
    d.appendChild(b);
  }
  r.appendChild(d);
  setTimeout(hide, undo ? 5500 : 2200);
}

/* ---------- fogli dal basso ---------- */
let sheetClose = null;
export const Sheet = {
  open(o) {
    const root = $('#sheet-root');
    root.innerHTML = '<div class="sh-back"></div><div class="sh" role="dialog">' +
      '<div class="sh-grip"></div>' +
      '<div class="sh-h"><div><h2>' + esc(o.title) + '</h2>' + (o.sub ? '<p>' + esc(o.sub) + '</p>' : '') + '</div>' +
      '<button class="sh-x" data-close aria-label="Chiudi">✕</button></div>' +
      '<div class="sh-body">' + (o.body || '') + '</div>' +
      (o.foot ? '<div class="sh-foot">' + o.foot + '</div>' : '') + '</div>';
    const sh = $('.sh', root);
    requestAnimationFrame(() => requestAnimationFrame(() => root.classList.add('open')));
    const close = () => Sheet.close();
    $('.sh-back', root).onclick = close;
    $('[data-close]', root).onclick = close;
    sheetClose = o.onClose || null;
    // trascinare in giù la maniglia chiude
    let y0 = null;
    const grip = $('.sh-grip', root);
    const h = $('.sh-h', root);
    [grip, h].forEach(el => {
      el.addEventListener('touchstart', e => { y0 = e.touches[0].clientY; }, { passive: true });
      el.addEventListener('touchmove', e => {
        if (y0 == null) return;
        const dy = Math.max(0, e.touches[0].clientY - y0);
        sh.style.transition = 'none'; sh.style.transform = 'translateY(' + dy + 'px)';
      }, { passive: true });
      el.addEventListener('touchend', e => {
        if (y0 == null) return;
        const dy = e.changedTouches[0].clientY - y0; y0 = null;
        sh.style.transition = ''; sh.style.transform = '';
        if (dy > 90) close();
      });
    });
    if (o.mount) o.mount(sh);
    return sh;
  },
  close() {
    const root = $('#sheet-root');
    if (!root.classList.contains('open')) return false;
    root.classList.remove('open');
    const cb = sheetClose; sheetClose = null;
    setTimeout(() => { if (!root.classList.contains('open')) root.innerHTML = ''; if (cb) cb(); }, 300);
    return true;
  },
  isOpen() { return $('#sheet-root').classList.contains('open'); }
};

export function confirmSheet(title, msg, ok, fn, danger) {
  Sheet.open({
    title, body: '<p class="muted" style="margin:0 0 8px">' + esc(msg) + '</p>',
    foot: '<div class="btn-row"><button class="btn ghost" data-x="no">Annulla</button>' +
      '<button class="btn ' + (danger ? 'danger' : 'primary') + '" data-x="ok">' + esc(ok) + '</button></div>',
    mount(sh) {
      $('[data-x=no]', sh).onclick = () => Sheet.close();
      $('[data-x=ok]', sh).onclick = () => { Sheet.close(); fn(); };
    }
  });
}

/* ---------- cursore con valore grande ---------- */
/** html di un cursore: id, min, max, step, value */
export function sliderHtml(id, min, max, step, value, unit) {
  return '<div class="slider"><div class="val num" id="' + id + '-v">' + fmt.n1(value) + ' <small>' + (unit || 'ml') + '</small></div>' +
    '<div class="sub" id="' + id + '-s"></div>' +
    '<input type="range" id="' + id + '" min="' + min + '" max="' + max + '" step="' + step + '" value="' + value + '">' +
    '<div class="ticks"><span>' + fmt.n1(min) + '</span><span>' + fmt.n1(max) + '</span></div></div>';
}
/** collega il cursore: onChange(v) restituisce il sottotitolo */
export function bindSlider(root, id, onChange, unit) {
  const r = $('#' + id, root);
  const paint = () => {
    const v = parseNum(r.value);
    const p = (v - r.min) / ((r.max - r.min) || 1) * 100;
    r.style.setProperty('--p', p + '%');
    $('#' + id + '-v', root).innerHTML = fmt.n1(v) + ' <small>' + (unit || 'ml') + '</small>';
    const s = onChange ? onChange(v) : '';
    $('#' + id + '-s', root).innerHTML = s || '';
  };
  r.addEventListener('input', () => { paint(); });
  r.addEventListener('change', () => haptic(8));
  paint();
  return {
    get: () => parseNum(r.value),
    set: v => { r.value = v; paint(); },
    setMax: m => { r.max = m; $$('.ticks span', r.parentNode)[1].textContent = fmt.n1(m); paint(); },
    el: r
  };
}

export function levelBar(left, ml, cls) {
  const p = ml > 0 ? Math.max(0, Math.min(100, left / ml * 100)) : 0;
  const c = p <= 0.5 ? 'bad' : p < 25 ? 'warn' : '';
  return '<div class="bar ' + (cls || '') + ' ' + c + '"><i style="width:' + p + '%"></i></div>';
}

export function bottleIcon(left, ml) {
  const p = ml > 0 ? Math.max(0, Math.min(100, left / ml * 100)) : 0;
  return '<div class="b' + (p <= 0.5 ? ' empty' : '') + '"><i style="height:' + p + '%"></i></div>';
}

export function bars(series, opts) {
  opts = opts || {};
  const max = Math.max(1e-9, ...series.map(s => s.v));
  return '<div class="bars">' + series.map((s, i) =>
    '<div class="b-col"><div class="b-val">' + (s.v > 0 ? (opts.f ? opts.f(s.v) : fmt.n(s.v, 0)) : '') + '</div>' +
    '<div class="b-bar' + (i === series.length - 1 ? ' hl' : '') + '" style="height:' + Math.max(2, s.v / max * 100) + '%"></div>' +
    '<div class="b-lab">' + esc(s.label) + '</div></div>').join('') + '</div>';
}

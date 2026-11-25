/* ============================================================
   Avvio, navigazione fra le schede, service worker.
   ============================================================ */
import { Store } from './store.js';
import { Catalog } from './catalog.js';
import { Home, Stock, Diary, Stats, Settings, ProductView, Timers, App } from './views.js';
import { $, $$, Sheet } from './ui.js';

const TABS = { home: Home, stock: Stock, diary: Diary, stats: Stats };
let tab = 'home';
const stack = [];      // schermate aperte sopra la scheda (prodotto, impostazioni)

function current() { return stack.length ? stack[stack.length - 1] : TABS[tab]; }

function render(keepScroll) {
  const v = current();
  const y = window.scrollY;
  Timers.clear();
  const val = x => (typeof x === 'function' ? x() : x);
  $('#tb-title h1').textContent = val(v.title) || 'Svapometro';
  $('#tb-sub').textContent = val(v.sub) || '';
  $('#tb-back').hidden = !stack.length;
  $('#tb-actions').innerHTML = v.actions ? v.actions() : '';
  const scr = $('#screen');
  scr.innerHTML = '<div' + (keepScroll ? '' : ' class="fade-in"') + '>' + v.render() + '</div>';
  if (v.mount) v.mount(scr.firstElementChild);
  if (v.actionsMount) v.actionsMount($('#tb-actions'));
  window.scrollTo(0, keepScroll ? y : 0);
  $$('#tabbar .tab').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
}

App.go = t => { tab = t; stack.length = 0; render(); };
App.push = (name, arg) => {
  if (name === 'product') stack.push(ProductView(arg));
  else if (name === 'settings') stack.push(Settings);
  render();
};
App.pop = () => { if (!stack.length) return false; stack.pop(); render(); return true; };
App.refresh = () => render(true);

// navigazione: schede in basso, data-nav ovunque
$('#tabbar').addEventListener('click', e => {
  const b = e.target.closest('.tab'); if (!b) return;
  if (b.dataset.tab === tab && !stack.length) { window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
  App.go(b.dataset.tab);
});
document.addEventListener('click', e => {
  const n = e.target.closest('[data-nav]');
  if (!n || n.closest('#sheet-root')) return;
  e.preventDefault();
  App.push(n.dataset.nav, n.dataset.pid);
});
$('#tb-back').addEventListener('click', () => App.pop());

// ogni modifica ai dati ridisegna la schermata, senza perdere il punto
Store.subscribe(() => render(true));

// gesto indietro di Android (se un giorno torna nel guscio nativo)
window.__back = () => Sheet.close() || App.pop() || (tab !== 'home' ? (App.go('home'), true) : false);

Store.load();
render();

// per il collaudo dalla console
window.__svapo = { Store, App };

// il catalogo si scarica in sottofondo dopo l'avvio
setTimeout(() => Catalog.load().catch(() => { }), 1500);

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(e => console.warn('[svapo] sw', e));
}

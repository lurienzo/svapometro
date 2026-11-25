# Svapometro

Web app per tenere i conti dello svapo: liquidi e boccette, rabbocchi, coil, spese e quanto si risparmia rispetto alle IQOS.
Funziona offline e i dati restano sul telefono: niente account, niente server.

Su iPhone: apri la pagina in Safari → Condividi → **Aggiungi alla schermata Home**.

## Come è fatta

Si salvano solo i **prodotti** e gli **eventi** (acquisto, rabbocco, cambio coil, livello, spesa).
Tutto il resto (scorte, livelli, spese, consumi, usura della coil) si ricalcola dagli eventi, così i numeri non possono andare fuori sincrono.

```
index.html, css/, js/
  model.js     prodotti, eventi, rigioco degli eventi
  calc.js      conti (spese, consumo, coil, risparmio)
  migrate.js   conversione dei backup della vecchia app Android
  store.js     salvataggio locale e backup
  flows.js     le registrazioni (rabbocco, acquisto, coil, livello)
  views.js     le schede
data/catalogo.json   catalogo liquidi per marca e linea
sw.js                cache per l'uso offline
```

## Collaudo

```bash
node test/test.js
```

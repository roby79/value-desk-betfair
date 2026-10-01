# Value Desk — Strategia sul movimento quota

Cambio di architettura rispetto a tutte le versioni precedenti di questo
progetto: **niente più un modello statistico nostro (Elo, ranking, bilancio
stagionale) da confrontare con il book**. Dopo un lungo percorso di ricerca
e un backtest reale che ha smentito quell'approccio (vedi "Perché questo
cambio" più sotto), il sistema ora segue direttamente il mercato: se la
quota di un lato si muove abbastanza da quando l'abbiamo vista la prima
volta, quello è il segnale.

## Come funziona

1. **TennisExplorer** resta la fonte del palinsesto giornaliero e delle
   quote (invariato, già debuggato a fondo nelle versioni precedenti).
2. **Cloudflare KV** (`ODDS_KV`) registra, per ogni partita, la quota vista
   la prima volta ("apertura") e la aggiorna a ogni controllo successivo
   ("attuale"). Il record scade da solo dopo 4 giorni.
3. **Un Worker separato** (`cron-worker.js`, da pubblicare come Worker a sé,
   non dentro il progetto Pages) richiama `/api/schedule` ogni ora, così il
   movimento si accumula anche senza che l'app sia aperta. Cloudflare Pages
   Functions non supporta Cron Trigger nativamente — da qui la necessità di
   un Worker a parte.
4. **Il segnale**: se la quota di un lato si è accorciata di almeno una
   soglia da quando l'abbiamo vista la prima volta, è PUNTA su quel lato.
   Soglie e range sono **congelati** dal backtest (vedi sotto) — non vanno
   cambiati senza un nuovo test.

| Parametro | Tour principale | Challenger |
|---|---|---|
| Soglia movimento minima | 5% | 8% |
| Range quota | 1,50 – 3,50 | 1,50 – 3,50 |
| Stake (% cassa attuale) | 5-8%→2% · 8-12%→3% · 12%+→4% | 8-10%→2% · 10-14%→3% · 14%+→4% |

Un torneo è riconosciuto come Challenger se il nome contiene letteralmente
"challenger" (così come arriva da TennisExplorer) — verificato affidabile
su tutti i tornei visti finora.

Lo stake resta soggetto al de-risking già esistente: se la cassa scende
sotto l'80% del suo massimo storico, la percentuale si dimezza. Nessun
Kelly: senza una stima di probabilità nostra, non c'è nulla su cui
calcolarlo — lo stake è una percentuale fissa per fascia di movimento.

## Perché questo cambio (la storia breve)

Le versioni precedenti confrontavano un Elo costruito da noi con il book,
segnalando quando divergevano. Un utente ha notato che il segnale usciva
quasi sempre "banca", su partite anche di alto livello (Beijing, Tokyo) — e
insistendo ha fatto scoprire due bug reali (margine del bookmaker non
tolto, né dal confronto né dall'Elo storico). Corretti quelli, il pattern
restava. Una ricerca più approfondita ha trovato che la letteratura
accademica documenta esattamente questo: un Elo semplice confrontato col
book tende a perdere, specialmente sovra-puntando gli sfavoriti (Kovalchik
2016, Angelini et al.). Un backtest vero, su 13.889 partite reali ATP/WTA
2024-2025 (dati Valuebetennis + tennis-data.co.uk), ha confermato: quella
strategia perdeva soldi a ogni soglia testata (-8% a -18% di ROI).

Lo stesso backtest, applicato invece al **movimento della quota (apertura
vs chiusura, su Pinnacle)**, ha dato risultati opposti: **ROI positivo a
ogni soglia testata**, sia su tour principale (+9% a +15,8%) sia sui
Challenger (più debole ma comunque positivo, +2,7% a +11,8%). Da qui la
scelta di ripartire da questa base.

**Il limite onesto da ricordare**: quel backtest misura il caso migliore
teorico (sapere in anticipo quale lato si muoverà, entrando esattamente
all'apertura). Nella pratica — rilevando il movimento a intervalli, non
nell'istante esatto dell'apertura — il vantaggio reale sarà probabilmente
più piccolo. Da qui la disciplina del registro (sotto): è l'unico modo per
sapere quanto vantaggio resta davvero una volta eseguito sul campo.

## Installazione

```bash
npm test
git add index.html package.json _routes.json functions lib test LEGGIMI.md
git commit -m "Strategia sul movimento quota: apertura/attuale, soglie congelate dal backtest"
git push
```

**Due cose da fare su Cloudflare, una tantum** (già fatte se segui questa
conversazione dall'inizio):
1. Namespace KV `VALUE_DESK_ODDS`, collegato al progetto Pages con il nome
   variabile `ODDS_KV` (Impostazioni → Binding).
2. Un Worker separato con dentro `cron-worker.js`, con un Cron Trigger
   `0 * * * *` (ogni ora).

## Come leggere l'app

Il Palinsesto mostra, per ogni partita: apertura→attuale per entrambi i
giocatori (con freccia di direzione), il movimento % di chi ha un segnale,
e lo stake consigliato. Solo le righe **PUNTA** (verdi) sono occasioni —
tutto il resto ("Fuori soglia", grigio) va ignorato.

Registrando una giocata, il modale chiede **due quote separate**: quella
"al segnale" (automatica, informativa) e quella "su Betfair" (da inserire
a mano — è quella vera, quella che conta per il calcolo di vincita/perdita
nello storico). Se lo stake calcolato scende sotto il minimo Betfair di
€1, l'app te lo segnala esplicitamente; l'importo resta sempre modificabile.

In Gestione Cassa, la sezione "Obiettivi & Disciplina" traccia quanti
segnali hai registrato questa settimana/mese e il ROI del mese corrente,
con un riferimento (+5-8% mensile, dal backtest) usato per la revisione
periodica — non un bersaglio da inseguire forzando le puntate nei momenti
storti.

## Verifiche e limiti

Test locali: 15 superati (palinsesto + tracciamento movimento in KV, con
KV finta in memoria per i test), nessuna dipendenza npm. Simulazione
numerica delle bande di stake e del de-risking da drawdown verificata a
mano (vedi cronologia del progetto).

Il tracciamento del movimento parte da zero da oggi: non abbiamo (né
possiamo avere gratuitamente) uno storico di apertura/chiusura per le
partite già passate prima dell'attivazione di questo sistema — ogni
partita vista per la prima volta diventa la sua stessa "apertura".

Le quote restano quelle indicative di TennisExplorer, non quote eseguibili
Betfair — da qui la necessità di inserire a mano la quota reale al momento
della registrazione.

## Lavoro ancora possibile, non fatto

1. **Validare il vantaggio reale sul campo**: il backtest misura il caso
   teorico migliore; serve un registro di 100+ segnali reali, con la quota
   Betfair effettiva, prima di aumentare gli stake.
2. **Rilevamento movimento più fine**: oggi il controllo è ogni ora; un
   controllo più frequente (es. ogni 15-30 min) potrebbe catturare il
   movimento più vicino al momento in cui accade, a costo di più richieste
   verso TennisExplorer.
3. **Distinguere Challenger "maggiori" da minori**: oggi tutti i Challenger
   usano la stessa soglia; non abbiamo un modo affidabile di distinguere il
   livello di montepremi dai dati disponibili.

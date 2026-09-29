# Value Desk — Elo + book, allerta su entrambi i lati

Palinsesto e profili reali da TennisExplorer via Pages Functions. Il
palinsesto legge circa 250 intestazioni torneo al giorno e filtra tornei
minori e partite senza quota reale; il bug che azzerava quasi tutti i
risultati (un popup "Live streams" annidato nelle righe partita veniva
scambiato per un'intestazione torneo) è risolto — l'intestazione si
riconosce ora solo dal tag `<tr>` di apertura, e il nome torneo si legge dal
suo link (`/nome-torneo/2026/atp-men/`), non dal testo intero della cella.

## Come funziona la stima

Tre componenti pesate: **45% bilancio stagionale**, **25% ranking**, **30%
Elo ricostruito dalle ultime partite** (fino a 10, dati reali dal profilo),
più un **correttivo sui precedenti diretti** (±5 punti percentuali massimo)
quando lo storico recente di un giocatore include scontri con l'avversario
di oggi. L'Elo riparte sempre da 1500 e rigioca solo le partite recenti
disponibili, assumendo un avversario storico medio (1500): non è un Elo
reale su tutta la carriera, ma non inventa risultati — usa solo vinto/perso
verificato dal profilo. Il modulo condiviso è `lib/elo.js` (testato), la
stessa logica è duplicata in `index.html` perché la pagina non è un modulo
ES e non può importare dal server.

**L'allerta scatta su entrambi i lati**, come richiesto: se il modello
preferisce la favorita più del book, segnala PUNTA; se invece preferisce la
sfavorita (margine negativo abbastanza ampio), segnala BANCA — cioè lo
stesso vantaggio letto dal lato opposto. Soglia minima: 3 punti percentuali
di margine, quota favorita tra 1,50 e 2,80. Sotto soglia: "Fuori soglia",
visibile ma non segnalata come occasione.

Nessuna componente mancante viene inventata: se manca ranking, bilancio o
storico di un giocatore, quella componente è semplicemente esclusa dalla
media pesata (rinormalizzata sulle componenti disponibili), o l'intera stima
resta "non disponibile" se non ne resta nessuna.

La correzione sulla percentuale di game vinti (dal punteggio dei set) NON è
stata implementata: il formato del punteggio estratto in solo testo
("62-7, 7-61, 7-5") è ambiguo — non si riesce a distinguere con certezza le
cifre del tie-break da quelle del set senza vedere l'HTML grezzo della
sezione. Implementarla alla cieca rischierebbe di produrre un numero sbagliato
spacciato per dato reale, il che va contro il principio di questo progetto.

La grafica dello ZIP originale, cassa e storico sono invariati.

## Installazione
Copiare index.html, package.json, _routes.json e le cartelle functions, lib, test
nella cartella del progetto, senza sostituire la cartella .git.

```bash
npm test
git add index.html package.json _routes.json functions lib test LEGGIMI.md
git commit -m "Elo da statistiche reali con H2H, allerta su favorita e sfavorita"
git push
```

Dopo il deploy: /api/schedule risponde con day/source/updated/matches;
/api/profile?path=/player/hurkacz/&label=Hurkacz%20H. restituisce rank,
seasonColumns e recent. Nel Palinsesto, premi "Aggiorna Match Reali" e
controlla la colonna centrale di ogni riga: modello%, book%, margine e quali
componenti sono state usate.

## Verifiche e limiti
Test locali: 18 superati (13 palinsesto/profilo/stima + 5 sul nuovo modulo
Elo), nessuna dipendenza npm, tutto eseguibile offline. Sintassi JS
verificata su entrambi gli script della pagina.
Deploy Cloudflare NON effettuato da questo ambiente; verificare su Cloudflare.
Il fuso fonte rilevato è GMT+1 fisso; visualizzazione Europe/Rome.
Le quote sono indicative della fonte, NON quote eseguibili Betfair né quote BANCA.
retrievedAt è il momento del recupero, non certificazione dell'aggiornamento
della fonte.

## Lavoro ancora necessario
1. Superficie specifica del torneo (serve leggere la pagina torneo e
   collegarla al match, poi usare la colonna Clay/Hard/Indoors/Grass giusta
   invece del bilancio aggregato).
2. Correzione percentuale game vinti (serve vedere l'HTML grezzo della
   sezione storico partite per interpretare correttamente la notazione dei
   punteggi con tie-break).
3. Validazione dei pesi 45/25/30 sui risultati futuri — non ancora fatta.
4. Elo persistente tra le richieste (oggi si ricostruisce da zero a ogni
   caricamento, dalle sole ultime 10 partite) — servirebbe uno storage
   (es. KV di Cloudflare) per accumulare un Elo vero nel tempo.
5. Commissioni e responsabilità BANCA nel calcolo dello stake.

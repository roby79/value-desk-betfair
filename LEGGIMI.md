# Collegamento dati Cloudflare — Elo parziale attivo

Palinsesto e profili reali da TennisExplorer via Pages Functions. Le Occasioni
sono ora attive con una stima combinata: 25% ranking, 20% storico recente
(fino a 10 incontri, dati reali estratti dal profilo), 55% bilancio
stagionale aggregato **come segnaposto della superficie** — la superficie
specifica del torneo non è ancora collegata (serve un'altra pagina/fetch),
quindi quella quota del peso non è ancora "di superficie" in senso stretto.
Il campo `market` di ogni riga lo dichiara esplicitamente.

Filtro quota 1,50–2,80 sulla favorita, soglia minima 3 punti percentuali di
margine (modello contro implicita di mercato) prima di segnalare PUNTA o
BANCA. Sotto soglia: "Fuori soglia", visibile ma non segnalato come
occasione. Nessuna componente mancante viene inventata: se manca ranking,
bilancio o storico di un giocatore, quella componente è semplicemente esclusa
dalla media pesata (rinormalizzata sulle componenti disponibili), o l'intera
stima resta "non disponibile" se non ne resta nessuna.

La correzione sulla percentuale di game vinti (dal punteggio dei set) NON è
stata implementata: il formato del punteggio estratto in solo testo
("62-7, 7-61, 7-5") è ambiguo — non si riesce a distinguere con certezza le
cifre del tie-break da quelle del set senza vedere l'HTML grezzo della
sezione. Implementarla alla cieca rischierebbe di produrre un numero sbagliato
spacciato per dato reale, il che va contro il principio di questo progetto.

La grafica dello ZIP originale, cassa e storico sono invariati. Le partite
fisse e le probabilità ricavate solo dalle quote restano rimosse.

## Installazione
Copiare index.html, package.json, _routes.json e le cartelle functions, lib, test
nella cartella del progetto, senza sostituire la cartella .git.

```bash
npm test
git add index.html package.json _routes.json functions lib test LEGGIMI.md
git commit -m "Attiva Elo parziale (ranking+recente, superficie come aggregato)"
git push
```

Dopo il deploy: /api/schedule risponde con day/source/updated/matches;
/api/profile?path=/player/hurkacz/&label=Hurkacz%20H. restituisce rank,
seasonColumns e recent (fino a 10 incontri reali con esito). Nel Palinsesto,
premi "Aggiorna Match Reali" e controlla la colonna centrale di ogni riga:
riporta modello%, book%, margine e quale componenti sono state usate.

## Verifiche e limiti
Test locali: 7 superati (3 palinsesto + 4 nuovi sul profilo/stima), nessuna
dipendenza npm, tutto eseguibile offline. Sintassi JS verificata su entrambi
gli script della pagina. La logica di stima è duplicata (server in
lib/source.js, client in index.html) perché la pagina non è un modulo ES:
se cambi la formula, aggiornala in entrambi i punti.
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
3. Validazione dei pesi 55/25/20 sui risultati futuri — non ancora fatta.
4. Commissioni e responsabilità BANCA nel calcolo dello stake.

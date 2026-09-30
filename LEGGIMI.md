# Value Desk — Elo v2: quote storiche, superficie, Glicko, log-odds, quote multi-bookmaker

Palinsesto e profili reali da TennisExplorer via Pages Functions. Il
palinsesto legge circa 250 intestazioni torneo al giorno e filtra tornei
minori e partite senza quota reale.

## Correzione importante: margine del bookmaker tolto dal confronto

Un utente ha notato che il segnale usciva **quasi sempre BANCA, mai PUNTA** su
tutto il palinsesto — segno plausibile di un bug sistematico, non di un
vantaggio reale. Trovato: confrontavamo il modello contro il "Book%" grezzo
(100/quota), che include il margine del bookmaker (overround) — le due
probabilità implicite grezze di una partita sommano sempre più di 100%
(tipicamente 104-108%), e quel margine gonfia il Book% della favorita più
del dovuto, spingendo il confronto sempre verso "la favorita è sopravvalutata"
a prescindere da cosa dicesse il modello. Corretto normalizzando le due
probabilità implicite in modo che sommino esattamente a 100% prima del
confronto. Su un caso reale verificato a mano (Arnaldi-Sakamoto, quote
1,67/2,18), il Book% è sceso da 59,5% a 56,6% — la correzione sposta ogni
partita di qualche punto verso PUNTA, quanto dipende dal margine di quel
bookmaker su quella partita.

## Come funziona la stima (v2)

Tre componenti combinate **in log-odds** (non media lineare — è il modo
statisticamente corretto di sommare fonti indipendenti, lo stesso principio
dell'aggiornamento bayesiano): **45% bilancio stagionale**, **25% ranking**,
**30% Elo ricostruito dalle ultime partite**.

Novità rispetto alla versione precedente:

- **Elo da quote storiche, non più avversario fisso a 1500**: per ogni
  partita recente, se conosciamo la quota che aveva allora il nostro
  giocatore (letta dallo storico del profilo), usiamo la probabilità
  implicita di quella quota come aspettativa dell'aggiornamento Elo — il
  mercato di allora sapeva già quanto fosse forte l'avversario. Quando la
  quota storica non è nota, si torna al fallback avversario-medio.
- **Superficie (sperimentale)**: se `/api/surface` riesce a leggere la
  superficie del torneo di oggi, il bilancio-stagione si calcola al 50%
  sull'aggregato e al 50% sulla colonna di superficie del profilo
  (Clay/Hard/Indoors/Grass) — proporzione empiricamente testata da terzi
  (Jeff Sackmann/tennisabstract.com), non scelta a caso.
- **Incertezza in stile Glicko (semplificata)**: quante meno partite recenti
  abbiamo usato per l'Elo, tanto più la stima finale viene tirata verso il
  50% prima del confronto con il book. Non è il vero algoritmo Glicko
  (iterativo, aggiorna l'incertezza di entrambi i giocatori insieme): è una
  versione semplificata che cattura la stessa idea con una formula fissa.
  Verificato con simulazione: con 1 partita a testa la confidenza scende
  intorno al 25%, con 10 partite sale intorno al 75%.
- **Quote multi-bookmaker (sperimentale, con rete di sicurezza)**: `/api/match-odds` legge la pagina di dettaglio della partita e ne fa la media, scartando le righe la cui coppia di numeri non ha un margine da bookmaker plausibile (somma delle probabilità implicite tra 0,97 e 1,25) — utile per non mischiare dentro quote di un mercato diverso (es. una soglia Over/Under scambiata per una quota). Anche così, un test reale ha mostrato un lato quasi perfetto e l'altro ancora spostato del 15% circa: il parser non è ancora perfetto. Per questo, lato client, la media viene **usata solo se resta entro il 10% dalla singola quota già affidabile del palinsesto**; se si discosta di più, la buttiamo e torniamo alla quota singola invece di rischiare un numero contaminato.

Più un correttivo sui precedenti diretti (±5 punti percentuali massimo),
come prima.

**L'allerta scatta su entrambi i lati**: PUNTA se il modello preferisce la
favorita di almeno 3 punti sul book; BANCA se preferisce la sfavorita di
almeno 3 punti (stesso vantaggio letto dal lato opposto, nel tennis non c'è
pareggio). Sotto soglia: "Fuori soglia", visibile ma non segnalata.

Il modulo condiviso è `lib/elo.js` (testato, 12 test). La stessa logica di
combinazione è duplicata in `index.html` perché la pagina non è un modulo ES
e non può importare dal server — se cambi la formula, aggiornala in
entrambi i punti.

## Cosa NON abbiamo copiato, e perché

Abbiamo verificato l'idea di usare le quote di un bookmaker "sharp" (es.
Pinnacle) come riferimento più affidabile del book. Scartata: tecnicamente
irraggiungibile da qui (protezione anti-bot, redirect loop), e soprattutto
Pinnacle dichiara esplicitamente nei suoi termini che le quote sono
proprietarie e non copiabili — non è terreno su cui costruire uno scraper.
La media multi-bookmaker da TennisExplorer (sopra) è il compromesso onesto
che resta dentro le regole che già rispettiamo.

La correzione sulla percentuale di game vinti (dal punteggio dei set) resta
NON implementata per lo stesso motivo di sempre: il formato del punteggio
estratto in solo testo è ambiguo (non si distinguono le cifre del tie-break)
senza vedere l'HTML grezzo della sezione.

## Sperimentale: cosa aspettarsi al primo giro

`/api/surface` e `/api/match-odds` leggono due pagine che non abbiamo mai
potuto verificare con un HTML reale (a differenza del palinsesto e del
profilo, verificati più volte con schermate vere). I parser sono scritti
con la struttura più plausibile, con test che usano un HTML finto
verosimile — ma è probabile che al primo utilizzo reale servano correzioni,
come è già successo con il palinsesto. Se il campo `surface` o `avgOdds`
tornano sempre `null`, non è necessariamente un problema del resto del
sistema: mandami il JSON di uno di questi due endpoint per un match reale e
sistemiamo il parser con gli stessi passi già usati per il palinsesto.

## Installazione
Copiare index.html, package.json, _routes.json e le cartelle functions, lib, test
nella cartella del progetto, senza sostituire la cartella .git.

```bash
npm test
git add index.html package.json _routes.json functions lib test LEGGIMI.md
git commit -m "Elo v2: quote storiche, superficie, Glicko, log-odds, quote multi-bookmaker"
git push
```

Dopo il deploy: /api/schedule risponde con day/source/updated/matches (ora
con anche tournamentUrl per match); /api/surface?path=/torneo/2026/atp-men/
e /api/match-odds?id=XXXX sono i due nuovi endpoint sperimentali - provali
direttamente nel browser su un match reale per vedere cosa restituiscono.

## Verifiche e limiti
Test locali: 30 superati (schedule, profilo, elo, match-detail), nessuna
dipendenza npm, tutto eseguibile offline (i test di superficie/quote
multi-bookmaker usano un fetch finto, non la rete reale). Sintassi JS
verificata su entrambi gli script della pagina. Simulazione end-to-end del
restringimento Glicko verificata a mano (confidenza 26% con 1 partita a
testa, 75% con 10).
Deploy Cloudflare NON effettuato da questo ambiente; verificare su Cloudflare.
Il fuso fonte rilevato è GMT+1 fisso; visualizzazione Europe/Rome.
Le quote sono indicative della fonte, NON quote eseguibili Betfair né quote BANCA.
retrievedAt è il momento del recupero, non certificazione dell'aggiornamento
della fonte.

## Lavoro ancora necessario
1. Verificare `/api/surface` e `/api/match-odds` su casi reali e correggere
   il parser se necessario (vedi sopra).
2. Correzione percentuale game vinti — ancora bloccata dall'ambiguità della
   notazione punteggio in solo testo.
3. Validazione dei pesi (45/25/30, blend superficie 50/50, soglia 3 punti,
   formula Glicko) sui risultati futuri — non ancora fatta su dati nostri.
4. Elo persistente tra le richieste (oggi si ricostruisce da zero a ogni
   caricamento, dalle sole ultime 10 partite) — servirebbe uno storage
   (es. KV di Cloudflare) per accumulare un Elo vero nel tempo, e per
   tracciare davvero il movimento delle quote apertura→attuale nel tempo
   invece di leggerlo (se disponibile) dalla sola pagina di dettaglio.
5. Commissioni e responsabilità BANCA nel calcolo dello stake.

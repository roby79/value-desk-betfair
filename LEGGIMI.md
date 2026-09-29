# Collegamento dati Cloudflare — versione intermedia

Questa consegna collega il calendario e i profili TennisExplorer con Pages Functions.
Non completa il motore Elo. Non pubblicare come versione definitiva delle Occasioni.

La grafica dello ZIP originale, cassa, storico e backup sono conservati. Le partite
fisse e le probabilità ricavate solo dalle quote sono rimosse dal palinsesto.
I dati cassa/storico rimangono nel localStorage esistente. Esportare prima il backup.

## Installazione
Copiare index.html, package.json, _routes.json e le cartelle functions, lib, test
nella cartella del progetto, senza sostituire la cartella .git.
Cloudflare Pages deve usare la radice del progetto come directory del sito e
compilare Pages Functions. Non usare il caricamento manuale della sola pagina HTML.

Dal terminale Visual Studio Code nella cartella del progetto:

```bash
npm test
git add index.html package.json _routes.json functions lib test LEGGIMI.md
git commit -m "Collega palinsesto reale e profili con Cloudflare Pages Functions"
git push
```

Dopo il deploy controllare /api/schedule: deve rispondere JSON con day, source,
updated e matches. /api/profile?path=/player/hurkacz/ restituisce i dati leggibili
sul profilo. Se una fonte fallisce viene mostrato un errore, mai incontri inventati.

## Verifiche e limiti
Test locali: 3 superati; sintassi JS verificata; 22 incontri futuri estratti da
una pagina reale scaricata il 28 settembre 2026. Deploy Cloudflare NON effettuato.
Accesso al sito pubblico dal nostro ambiente: HTTP 403. Va verificato su Cloudflare.
Il fuso fonte rilevato è GMT+1 fisso; visualizzazione Europe/Rome.
Le quote sono indicative della fonte, NON quote eseguibili Betfair né quote BANCA.
I profili restituiscono ranking e colonne stagionali quando leggibili: non garantisce
che la fonte includa ogni risultato appena concluso. retrievedAt è il momento del
recupero, non certificazione dell'aggiornamento della fonte.

## Lavoro ancora necessario
Storico completo con ID giocatori e avversari, data effettiva, superficie, risultati;
aggiornamento incrementale persistente, Elo generale/superficie/recente definiti,
percentuali game con campione e periodo. Solo dopo collegare i pesi del vecchio
modello (55/25/20, superficie ridotta con campione <5), validare e riattivare le
Occasioni. Il modello precedente non è stato validato sui risultati futuri.
Commissioni e responsabilità BANCA richiedono correzioni separate nel calcolo.

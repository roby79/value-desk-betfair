# Value Desk — versione di lavoro

Sito statico in `public/` con funzione Netlify `/api/schedule`, che legge pagine pubbliche di Tennis Explorer via scraping, senza chiavi API. Il registro e le impostazioni sono salvati nel browser locale. La sincronizzazione tra dispositivi richiederà un accesso personale; `/api/data` risponde 503 per evitare accessi pubblici ai dati della cassa.

Pubblicazione standard: nella cartella del progetto eseguire `npm install`, `npx netlify login`, `npx netlify link` e `npx netlify deploy` per l'anteprima. Verificare l'anteprima e `/api/schedule` prima di usare `npx netlify deploy --prod`.

## Logica tennis

La selezione usa le quote indicativamente riportate da Tennis Explorer, un limite 1,50–3,00, ranking, bilanci stagionali e bilanci sulla superficie con un minimo di osservazioni. I precedenti diretti sono mostrati quando disponibili nella scheda della partita ma non influenzano la stima, perché spesso hanno campioni troppo piccoli. Usa una formula euristica smussata verso la quota di mercato. Un margine di 3 punti percentuali genera soltanto un **candidato**. La forma recente usa fino a 10 risultati completi della stagione e pesa nella stima soltanto con almeno 5 risultati per giocatore. Servizio, risposta, infortuni e aggiornamenti sulla quota effettiva non sono automatizzati né verificati: controllarli prima di registrare una giocata. Il modello non è calibrato con dati storici né sottoposto a backtest e non fornisce una previsione di profitto.

Versione scraping-v3. Il palinsesto viene caricato prima delle statistiche. Tutte le singole nel range di quota sono poi analizzate tramite /api/match, con tre richieste contemporanee. Gli orari della fonte GMT+1 sono convertiti in istanti assoluti e filtrati sul giorno italiano e sull’orario corrente. Le righe con punteggio già presente sono escluse. Se la fonte cambia HTML, la superficie non è verificabile o i campioni sono troppo piccoli, la partita non compare tra le occasioni. Il registro tennis è separato dal registro calcio. Lo stake è una simulazione di Kelly frazionato con massimo 2% della cassa mostrata e commissione configurata, non un ritorno garantito.

I dati salvati nel browser non sono condivisi tra dispositivi e possono andare persi cancellando i dati del sito.

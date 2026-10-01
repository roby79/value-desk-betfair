// Worker-sveglia per Value Desk.
// Unico scopo: richiamare /api/schedule ogni ora, cosi' il tracciamento
// apertura/movimento quota (in Cloudflare KV, lato Pages Function) si
// aggiorna anche quando nessuno ha l'app aperta. Non legge e non scrive
// nessuna KV direttamente: tutto il lavoro vero lo fa /api/schedule.
//
// Come usarlo:
// 1. Su Cloudflare, crea un nuovo Worker (separato dal progetto Pages).
// 2. Incolla questo codice nell'editor del Worker.
// 3. Nelle impostazioni del Worker, sezione "Trigger"/"Cron Trigger",
//    aggiungi: 0 * * * *  (ogni ora, al minuto 0).
// 4. Pubblica. Non serve nessun'altra configurazione: questo Worker non
//    ha bisogno di binding KV, ne' di segreti.

const SCHEDULE_URL = 'https://value-desk-betfair.pages.dev/api/schedule';

export default {
  async scheduled(event, env, ctx) {
    try {
      const res = await fetch(SCHEDULE_URL, { cf: { cacheTtl: 0 } });
      console.log('Controllo orario eseguito:', res.status);
    } catch (e) {
      console.log('Controllo orario fallito:', e.message);
    }
  },
  // Permette anche un richiamo manuale da browser per un test immediato,
  // senza dover aspettare la prossima ora.
  async fetch(request, env, ctx) {
    try {
      const res = await fetch(SCHEDULE_URL, { cf: { cacheTtl: 0 } });
      return new Response('Controllo eseguito, stato: ' + res.status, { status: 200 });
    } catch (e) {
      return new Response('Controllo fallito: ' + e.message, { status: 500 });
    }
  },
};

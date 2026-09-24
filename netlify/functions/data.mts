import type { Config } from "@netlify/functions";

// Senza accesso personale un archivio condiviso esporrebbe i dati della cassa.
export default async () => new Response("Sincronizzazione non disponibile", {
  status: 503,
  headers: { "Cache-Control": "no-store" },
});

export const config: Config = { path: "/api/data" };

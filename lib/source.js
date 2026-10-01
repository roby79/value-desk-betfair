export const origin='https://www.tennisexplorer.com';
export const clean=s=>s.replace(/<[^>]*>/g,' ').replace(/&nbsp;|&#160;/g,' ').replace(/&amp;/g,'&').replace(/\s+/g,' ').trim();
export const dayOf=d=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Rome',year:'numeric',month:'2-digit',day:'2-digit'}).format(d);
export const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
export async function get(path,timeoutMs=12000){
 const u=new URL(path,origin);
 if(u.origin!==origin)throw new Error('Fonte non consentita');
 const r=await fetch(u,{signal:AbortSignal.timeout(timeoutMs),headers:{
  Accept:'text/html',
  'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
 },redirect:'manual'});
 if(r.status>=300&&r.status<400)throw new Error('Fonte ha reindirizzato altrove, richiesta rifiutata');
 if(!r.ok)throw new Error(`Fonte HTTP ${r.status}`);
 return await r.text();
}
export async function getPlayerPage(path){
 const h=await get(path);
 if(!h.includes('/player/'))throw new Error('Pagina fonte non riconosciuta');
 return h;
}
export function parseSchedule(html,now=new Date()){
 let day=null,tournament='',tournamentUrl=null,pending=null;const result=[];
 for(const token of html.matchAll(/<span\b[^>]*class="tab"[^>]*>([\s\S]*?)<\/span>|<tr\b[^>]*>[\s\S]*?<\/tr>/gi)){
  if(token[1]!==undefined){const d=clean(token[1]).match(/(\d{2})\.\s*(\d{2})\.\s*(\d{4})/);day=d?`${d[3]}-${d[2]}-${d[1]}`:null;pending=null;continue;}
  const row=token[0],cells=[...row.matchAll(/<td\b([^>]*)>([\s\S]*?)<\/td>/gi)];
  // L'intestazione di torneo va riconosciuta solo dal tag <tr> di apertura:
  // molte righe di partita contengono altrove nella riga un popup streaming
  // con un <div class="head tl">, che finirebbe per essere scambiato per
  // un'intestazione se si cercasse class="head" in tutta la riga.
  const trOpen=row.match(/^<tr\b([^>]*)>/i);
  const isHeaderRow=trOpen?/\bclass="[^"]*\bhead\b[^"]*"/.test(trOpen[1]):false;
  if(isHeaderRow){
   // Il nome (e il link) del torneo si leggono dal link alla pagina del
   // torneo stesso (es. /chengdu/2026/atp-men/), non dal testo intero della
   // cella: quella può contenere anche altro (bandiera, indicatori)
   // mescolato al nome. Il link serve anche per leggere la superficie in un
   // secondo momento (fetchSurface).
   const tourLink=row.match(/<a\b[^>]*href="(\/([a-z0-9-]+)\/20\d\d\/(?:atp-men|wta-women)[^"]*)"[^>]*>([\s\S]*?)<\/a>/i);
   const t=tourLink?clean(tourLink[3]):clean(cells[0]?.[2]||'');
   tournament=t&&!/live streams/i.test(t)?t:'Torneo non identificato';
   tournamentUrl=tourLink?tourLink[1]:null;
   pending=null;continue;
  }
  const player=row.match(/<a\b[^>]*href="(\/player\/[^"?#]+)"[^>]*>([\s\S]*?)<\/a>/i);
  if(!player){pending=null;continue;}
  const timeCell=cells.find(c=>/\btime\b/.test(c[1]));
  const started=cells.some(c=>/class="(?:result|score)"/.test(c[1])&&/\d/.test(clean(c[2])))||/retired|walkover|cancelled|postponed/i.test(clean(row));
  if(timeCell){
   pending=null; const time=clean(timeCell[2]).match(/\b\d{2}:\d{2}\b/)?.[0];
   if(!day||!time||started)continue;
   const startsAt=new Date(`${day}T${time}:00+01:00`);
   if(!(startsAt>now)||dayOf(startsAt)!==dayOf(now))continue;
   const odds=cells.filter(c=>/class="coursew?"/.test(c[1])).map(c=>Number(clean(c[2]).replace(',','.'))||null);
   pending={id:row.match(/match-detail\/\?id=(\d+)/)?.[1]||`${day}-${player[1]}-${time}`,tournament,tournamentUrl,startsAt:startsAt.toISOString(),p1:clean(player[2]),profiles:[player[1]],odds};
  }else if(pending){if(!started){pending.p2=clean(player[2]);pending.profiles.push(player[1]);result.push(pending);}pending=null;}
 }
 // Tornei troppo minori (o non identificabili) per trovare davvero un mercato
 // apribile: meglio non mostrarli piuttosto che far perdere tempo a cercarli.
 const MINOR=/futures|utr pro|\bitf\b|\bm15\b|\bm25\b|\bw15\b|\bw25\b|junior|torneo non identificato/i;
 // "Ha mercato" qui vuol dire concretamente: almeno un bookmaker ha già
 // pubblicato una quota per entrambi i giocatori. Non sappiamo distinguere un
 // Challenger "principale" da uno minore per nome (servirebbe un'altra pagina
 // da collegare), ma la presenza di una quota reale è il segnale più onesto
 // che abbiamo per "qualcuno lo sta seguendo".
 const hasMarket=m=>Array.isArray(m.odds)&&m.odds.length===2&&m.odds[0]!=null&&m.odds[1]!=null;
 const filtered=result.filter(m=>!MINOR.test(m.tournament)&&hasMarket(m));
 return [...new Map(filtered.map(m=>[m.id,m])).values()];
}
export function profileStats(html,playerLabel){
 const text=clean(html);const rank=text.match(/Current\/Highest rank\s*-\s*singles:\s*(\d+)/i)?.[1];
 const rows=[...html.matchAll(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi)].map(r=>[...r[0].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(c=>clean(c[1])));
 const year=String(new Date().getUTCFullYear());
 const season=rows.find(r=>r[0]===year&&r.some(c=>/^\d+\/\d+$/.test(c)));
 // Storico recente: ogni torneo è una tabella con intestazione
 // "<Torneo> | Round | Result | H | A" seguita dalle righe delle partite giocate.
 // Il nome del giocatore compare per primo se ha vinto (convenzione della fonte).
 // Le ultime due celle numeriche della riga sono le quote H/A di quella
 // partita: la assegniamo al giocatore giusto in base a chi compare per
 // primo nel " - ", cosi eloDaStorico può usarla al posto di un avversario
 // medio fisso (vedi lib/elo.js).
 let tournament=null;const recent=[];
 if(playerLabel)for(const r of rows){
  if(r.length>=3&&r[1]==='Round'&&r[2]==='Result'){tournament=r[0];continue;}
  if(!tournament)continue;
  const dateMatch=r[0]&&r[0].match(/^\d{2}\.\d{2}\.?$/);
  const vs=r.find(c=>c.includes(' - '));
  if(!dateMatch||!vs)continue;
  const [p1,p2]=vs.split(' - ').map(s=>s.trim());
  if(p1!==playerLabel&&p2!==playerLabel)continue;
  const won=p1===playerLabel;
  const oddsCells=r.filter(c=>/^\d{1,3}[.,]\d{1,2}$/.test(c)).map(c=>Number(c.replace(',','.')));
  const p1Odds=oddsCells[0]??null, p2Odds=oddsCells[1]??null;
  recent.push({tournament,date:dateMatch[0],opponent:won?p2:p1,won,
   ownOdds:won?p1Odds:p2Odds, oppOdds:won?p2Odds:p1Odds});
  if(recent.length>=10)break;
 }
 return {rank:rank?Number(rank):null,seasonColumns:season||null,
  recent:playerLabel?recent:null,
  reason:playerLabel&&!recent.length?'Storico partite non trovato sul profilo per questo giocatore.':null};
}

// --- Superficie del torneo (sperimentale) -----------------------------------
// La pagina del torneo di solito riporta, vicino al nome, qualcosa come
// "(1.210.115 $, hard, men)". Non abbiamo potuto verificare questa pagina
// con un HTML reale prima di scriverlo: è un tentativo ragionevole basato su
// una struttura osservata su questo stesso sito in passato, ma va
// considerato sperimentale finché non lo confermiamo con un caso reale.
const SURFACES=['hard','clay','grass','indoor hard','indoors'];
export async function fetchSurface(tournamentUrl){
 if(!tournamentUrl)return null;
 try{
  const html=await get(tournamentUrl,8000);
  const text=clean(html).toLowerCase();
  const m=text.match(/\(([^)]{0,60})\)/);
  if(m){
   const inside=m[1];
   const found=SURFACES.find(s=>inside.includes(s));
   if(found)return found==='indoors'?'indoor hard':found;
  }
  const anywhere=SURFACES.find(s=>text.includes(s));
  return anywhere?(anywhere==='indoors'?'indoor hard':anywhere):null;
 }catch{return null;}
}

// --- Quote multi-bookmaker dalla pagina di dettaglio partita (sperimentale) -
// Non abbiamo potuto verificare la struttura reale di questa pagina prima di
// scriverla. Prima versione: prendeva qualsiasi riga con due numeri
// decimali, ma la pagina mostra più mercati insieme (vincitore, handicap
// giochi, totali) - una soglia come "22.5" di un mercato Over/Under veniva
// scambiata per una quota, contaminando la media. Corretto: prendiamo solo
// le prime due quote di ogni riga e verifichiamo che la somma delle
// probabilità implicite (1/quota1 + 1/quota2) stia vicino a 1 (margine
// tipico del bookmaker, qui 0,97-1,25) - se non torna, l'intera riga viene
// scartata piuttosto che tentare un'altra coppia nella stessa riga (che
// potrebbe comunque appartenere a un mercato diverso e sembrare plausibile
// per puro caso).
// La rilevazione della quota di apertura resta troppo incerta per fidarsene
// (un primo tentativo ha prodotto un valore chiaramente sbagliato su un test
// reale): per ora resta sempre null finché non verifichiamo la pagina vera.
export async function fetchMatchOdds(matchId){
 if(!matchId)return null;
 try{
  const html=await get(`/match-detail/?id=${matchId}`,8000);
  const rows=[...html.matchAll(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi)].map(r=>
   [...r[0].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(c=>clean(c[1]))
  );
  const isPlausibleTwoWay=(h,a)=>{
   if(!(h>1.01&&h<=100&&a>1.01&&a<=100))return false;
   const overround=1/h+1/a;
   return overround>=0.97&&overround<=1.25;
  };
  const oddsRows=rows.map(cells=>{
   const nums=cells.filter(c=>/^\d{1,3}[.,]\d{1,2}$/.test(c)).map(c=>Number(c.replace(',','.')));
   if(nums.length<2)return null;
   const [h,a]=nums;
   return isPlausibleTwoWay(h,a)?{h,a}:null;
  }).filter(Boolean);
  if(!oddsRows.length)return null;
  const avg=arr=>arr.reduce((s,v)=>s+v,0)/arr.length;
  return {
   avgOdds:[+avg(oddsRows.map(r=>r.h)).toFixed(2),+avg(oddsRows.map(r=>r.a)).toFixed(2)],
   openOdds:null,
   bookmakerCount:oddsRows.length,
  };
 }catch{return null;}
}

// --- Movimento quota: apertura vs attuale, salvato in Cloudflare KV --------
// La prima volta che vediamo una partita, la sua quota diventa "apertura" e
// resta fissa da lì in poi. Ogni chiamata successiva aggiorna solo
// "attuale". `kv` è il binding KV passato dalla Pages Function (mai
// importato direttamente qui, per restare testabile offline con una KV
// finta). Il record scade da solo dopo 4 giorni (nessuna partita nel
// palinsesto resta visibile così a lungo), così la KV non cresce in eterno.
const ODDS_TTL_SECONDS = 4*24*60*60;
export async function trackOddsMovement(kv, matchId, oddsPair){
 if(!kv||!matchId||!Array.isArray(oddsPair)||oddsPair.length!==2)return null;
 const key=`odds:${matchId}`;
 let record=null;
 try{const raw=await kv.get(key); record=raw?JSON.parse(raw):null;}catch{record=null;}
 const now=new Date().toISOString();
 if(!record){
  record={openOdds:oddsPair,openAt:now,currentOdds:oddsPair,lastAt:now};
 }else{
  record.currentOdds=oddsPair;
  record.lastAt=now;
 }
 try{await kv.put(key,JSON.stringify(record),{expirationTtl:ODDS_TTL_SECONDS});}catch{/* non bloccante: se la scrittura fallisce, continuiamo senza movimento per questo giro */}
 const move=(side)=>{
  const o=record.openOdds[side], c=record.currentOdds[side];
  if(!(o>1)||!(c>1))return null;
  return +((c-o)/o*100).toFixed(1); // negativo = quota accorciata (steam), positivo = allungata (drift)
 };
 return {
  openOdds:record.openOdds, currentOdds:record.currentOdds,
  openAt:record.openAt,
  movePct:[move(0),move(1)],
 };
}

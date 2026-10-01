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
   // mescolato al nome.
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
 // pubblicato una quota per entrambi i giocatori.
 const hasMarket=m=>Array.isArray(m.odds)&&m.odds.length===2&&m.odds[0]!=null&&m.odds[1]!=null;
 const filtered=result.filter(m=>!MINOR.test(m.tournament)&&hasMarket(m));
 return [...new Map(filtered.map(m=>[m.id,m])).values()];
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

// --- Betfair: autenticazione e lettura mercati tennis -----------------------
// Login "interattivo" via API (solo username/password), non il login "non
// interattivo" con certificato che Betfair raccomanda per i bot: quello
// richiede un certificato client nelle chiamate in uscita, funzionalità che
// Cloudflare non supporta in modo semplice. Il limite di login (100/minuto)
// rende comunque sicuro rifare il login a ogni controllo (ogni 15 minuti)
// invece di gestire una sessione che scade.
const BETFAIR_LOGIN_URL='https://identitysso.betfair.it/api/login';
const BETFAIR_API_URL='https://api.betfair.com/exchange/betting/json-rpc/v1';

export async function betfairLogin(appKey,username,password){
 const r=await fetch(BETFAIR_LOGIN_URL,{
  method:'POST',
  headers:{'X-Application':appKey,'Content-Type':'application/x-www-form-urlencoded','Accept':'application/json'},
  body:`username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`,
 });
 if(!r.ok)throw new Error(`Login Betfair HTTP ${r.status}`);
 const data=await r.json();
 // Formato reale confermato dalla documentazione ufficiale (Interactive
 // Login - API Endpoint): {token, product, status, error}. Non
 // {sessionToken, loginStatus} - quel formato è del login non interattivo
 // (con certificato), un flusso diverso da questo.
 if(data.status!=='SUCCESS'||!data.token)throw new Error('Login Betfair fallito: '+(data.error||data.status||'risposta inattesa'));
 return data.token;
}

async function betfairCall(appKey,sessionToken,method,params){
 const r=await fetch(BETFAIR_API_URL,{
  method:'POST',
  headers:{'X-Application':appKey,'X-Authentication':sessionToken,'Content-Type':'application/json','Accept':'application/json'},
  body:JSON.stringify({jsonrpc:'2.0',method:'SportsAPING/v1.0/'+method,params,id:1}),
 });
 if(!r.ok)throw new Error(`Betfair API HTTP ${r.status}`);
 const data=await r.json();
 if(data.error)throw new Error('Betfair API error: '+JSON.stringify(data.error));
 return data.result;
}

// Elenco partite di tennis (singolo, mercato "vincente") nelle prossime 24h.
export async function betfairListTennisMatches(appKey,sessionToken,hoursAhead=24){
 const now=new Date();
 const to=new Date(now.getTime()+hoursAhead*60*60*1000);
 const markets=await betfairCall(appKey,sessionToken,'listMarketCatalogue',{
  filter:{eventTypeIds:['2'],marketTypeCodes:['MATCH_ODDS'],marketStartTime:{from:now.toISOString(),to:to.toISOString()}},
  maxResults:'100',
  marketProjection:['EVENT','RUNNER_DESCRIPTION','MARKET_START_TIME'],
 });
 return markets||[];
}

// Quote attuali (migliore prezzo "back" disponibile) per una lista di mercati.
export async function betfairMarketBook(appKey,sessionToken,marketIds){
 if(!marketIds||!marketIds.length)return [];
 const books=await betfairCall(appKey,sessionToken,'listMarketBook',{
  marketIds,
  priceProjection:{priceData:['EX_BEST_OFFERS']},
 });
 return books||[];
}

export const origin='https://www.tennisexplorer.com';
export const clean=s=>s.replace(/<[^>]*>/g,' ').replace(/&nbsp;|&#160;/g,' ').replace(/&amp;/g,'&').replace(/\s+/g,' ').trim();
export const dayOf=d=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Rome',year:'numeric',month:'2-digit',day:'2-digit'}).format(d);
export const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
export async function get(path){
 const u=new URL(path,origin);
 if(u.origin!==origin)throw new Error('Fonte non consentita');
 const r=await fetch(u,{signal:AbortSignal.timeout(12000),headers:{
  Accept:'text/html',
  'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
 },redirect:'manual'});
 if(r.status>=300&&r.status<400)throw new Error('Fonte ha reindirizzato altrove, richiesta rifiutata');
 if(!r.ok)throw new Error(`Fonte HTTP ${r.status}`);
 const h=await r.text(); if(!h.includes('/player/'))throw new Error('Pagina fonte non riconosciuta'); return h;
}
export let lastParseStats = null;
export function parseSchedule(html,now=new Date()){
 let day=null,tournament='',pending=null;const result=[];
 const stats={tabTokens:0,dayValues:[],headerRows:0,playerRows:0,noPlayerRows:0,pendingCreated:0,pendingCompletedBeforeFilter:0,skippedNoDayTimeOrStarted:0,skippedNotFuture:0,sampleOddsRaw:[],sampleTournaments:[]};
 for(const token of html.matchAll(/<span\b[^>]*class="tab"[^>]*>([\s\S]*?)<\/span>|<tr\b[^>]*>[\s\S]*?<\/tr>/gi)){
  if(token[1]!==undefined){
   stats.tabTokens++;
   const d=clean(token[1]).match(/(\d{2})\.\s*(\d{2})\.\s*(\d{4})/);day=d?`${d[3]}-${d[2]}-${d[1]}`:null;
   if(stats.dayValues.length<6)stats.dayValues.push(day);
   pending=null;continue;
  }
  const row=token[0],cells=[...row.matchAll(/<td\b([^>]*)>([\s\S]*?)<\/td>/gi)];
  if(/class="head\b/.test(row)){
   stats.headerRows++;
   // Il nome del torneo lo prendiamo dal link alla pagina del torneo stesso
   // (es. /chengdu/2026/atp-men/), non dal testo intero della cella: quella
   // cella a volte contiene anche altro (es. un indicatore "live streams" per
   // il prossimo match), e leggerla per intero dava un falso "non identificato"
   // nella maggior parte dei casi.
   const tourLink=row.match(/<a\b[^>]*href="\/([a-z0-9-]+)\/20\d\d\/(?:atp-men|wta-women)[^"]*"[^>]*>([\s\S]*?)<\/a>/i);
   const t=tourLink?clean(tourLink[2]):clean(cells[0]?.[2]||'');
   tournament=t&&!/live streams/i.test(t)?t:'Torneo non identificato';
   pending=null;continue;
  }
  const player=row.match(/<a\b[^>]*href="(\/player\/[^"?#]+)"[^>]*>([\s\S]*?)<\/a>/i);
  if(!player){stats.noPlayerRows++;pending=null;continue;}
  stats.playerRows++;
  const timeCell=cells.find(c=>/\btime\b/.test(c[1]));
  const started=cells.some(c=>/class="(?:result|score)"/.test(c[1])&&/\d/.test(clean(c[2])))||/retired|walkover|cancelled|postponed/i.test(clean(row));
  if(timeCell){
   pending=null; const time=clean(timeCell[2]).match(/\b\d{2}:\d{2}\b/)?.[0];
   if(!day||!time||started){stats.skippedNoDayTimeOrStarted++;continue;}
   const startsAt=new Date(`${day}T${time}:00+01:00`);
   if(!(startsAt>now)||dayOf(startsAt)!==dayOf(now)){stats.skippedNotFuture++;continue;}
   const oddsCells=cells.filter(c=>/class="coursew?"/.test(c[1]));
   const odds=oddsCells.map(c=>Number(clean(c[2]).replace(',','.'))||null);
   if(stats.sampleOddsRaw.length<5)stats.sampleOddsRaw.push(oddsCells.map(c=>clean(c[2])));
   pending={id:row.match(/match-detail\/\?id=(\d+)/)?.[1]||`${day}-${player[1]}-${time}`,tournament,startsAt:startsAt.toISOString(),p1:clean(player[2]),profiles:[player[1]],odds};
   stats.pendingCreated++;
   if(stats.sampleTournaments.length<8)stats.sampleTournaments.push(tournament);
  }else if(pending){if(!started){pending.p2=clean(player[2]);pending.profiles.push(player[1]);result.push(pending);stats.pendingCompletedBeforeFilter++;}pending=null;}
 }
 stats.resultBeforeFilter=result.length;
 // Tornei troppo minori (o non identificabili) per trovare davvero un mercato
 // apribile: meglio non mostrarli piuttosto che far perdere tempo a cercarli.
 const MINOR=/futures|utr pro|\bitf\b|\bm15\b|\bm25\b|\bw15\b|\bw25\b|junior|torneo non identificato/i;
 // "Ha mercato" qui vuol dire concretamente: almeno un bookmaker ha già
 // pubblicato una quota per entrambi i giocatori. Non sappiamo distinguere un
 // Challenger "principale" da uno minore per nome (servirebbe un'altra pagina
 // da collegare), ma la presenza di una quota reale è il segnale più onesto
 // che abbiamo per "qualcuno lo sta seguendo".
 const hasMarket=m=>Array.isArray(m.odds)&&m.odds.length===2&&m.odds[0]!=null&&m.odds[1]!=null;
 stats.failedMinor=result.filter(m=>MINOR.test(m.tournament)).length;
 stats.failedMarket=result.filter(m=>!hasMarket(m)).length;
 const filtered=result.filter(m=>!MINOR.test(m.tournament)&&hasMarket(m));
 const final=[...new Map(filtered.map(m=>[m.id,m])).values()];
 stats.resultAfterFilter=final.length;
 lastParseStats=stats;
 return final;
}
export function profileStats(html,playerLabel){
 const text=clean(html);const rank=text.match(/Current\/Highest rank\s*-\s*singles:\s*(\d+)/i)?.[1];
 const rows=[...html.matchAll(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi)].map(r=>[...r[0].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(c=>clean(c[1])));
 const year=String(new Date().getUTCFullYear());
 const season=rows.find(r=>r[0]===year&&r.some(c=>/^\d+\/\d+$/.test(c)));
 // Storico recente: ogni torneo è una tabella con intestazione
 // "<Torneo> | Round | Result | H | A" seguita dalle righe delle partite giocate.
 // Il nome del giocatore compare per primo se ha vinto (convenzione della fonte).
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
  recent.push({tournament,date:dateMatch[0],opponent:won?p2:p1,won});
  if(recent.length>=10)break;
 }
 return {rank:rank?Number(rank):null,seasonColumns:season||null,
  recent:playerLabel?recent:null,
  reason:playerLabel&&!recent.length?'Storico partite non trovato sul profilo per questo giocatore.':null};
}
// Stima combinata 55% aggregato-stagione (segnaposto della superficie finché
// non colleghiamo la superficie del torneo) / 25% ranking / 20% recente,
// ciascuna espressa come quota di probabilità con correzione additiva (+1/+1)
// per non azzerarsi su pochi incontri. Nessun dato mancante viene inventato:
// una componente assente riduce semplicemente il totale su cui si media.
export function estimateProbability(a,b){
 const pair=s=>{const m=s&&String(s).match(/^(\d+)\/(\d+)$/);return m?{w:+m[1],l:+m[2]}:null;};
 const rankShare=(a.rank&&b.rank)?(1/a.rank)/(1/a.rank+1/b.rank):null;
 const sA=a.seasonColumns&&pair(a.seasonColumns[1]),sB=b.seasonColumns&&pair(b.seasonColumns[1]);
 const rate=p=>p?(p.w+1)/(p.w+p.l+2):null;
 const rA=rate(sA),rB=rate(sB);
 const seasonShare=(rA!=null&&rB!=null)?rA/(rA+rB):null;
 const recentRate=m=>(!m||!m.length)?null:(m.filter(x=>x.won).length+1)/(m.length+2);
 const reA=recentRate(a.recent),reB=recentRate(b.recent);
 const recentShare=(reA!=null&&reB!=null)?reA/(reA+reB):null;
 const parts=[[0.55,seasonShare],[0.25,rankShare],[0.20,recentShare]].filter(([,v])=>v!=null);
 if(!parts.length)return{prob:null,reason:'Dati insufficienti: servono ranking, bilancio stagionale o storico recente di entrambi.'};
 const totalW=parts.reduce((s,[w])=>s+w,0);
 const prob=parts.reduce((s,[w,v])=>s+w*v,0)/totalW;
 return{prob,componentsUsed:parts.length,totalWeightUsed:totalW,
  reason:parts.length<3?'Stima parziale: manca '+(3-parts.length)+' componente su 3.':null};
}

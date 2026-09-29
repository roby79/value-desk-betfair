export const origin='https://www.tennisexplorer.com';
export const clean=s=>s.replace(/<[^>]*>/g,' ').replace(/&nbsp;|&#160;/g,' ').replace(/&amp;/g,'&').replace(/\s+/g,' ').trim();
export const dayOf=d=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Rome',year:'numeric',month:'2-digit',day:'2-digit'}).format(d);
export const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
export async function get(path){
 const u=new URL(path,origin);
 if(u.origin!==origin)throw new Error('Fonte non consentita');
 const r=await fetch(u,{signal:AbortSignal.timeout(12000),headers:{Accept:'text/html'},redirect:'error'});
 if(!r.ok)throw new Error(`Fonte HTTP ${r.status}`);
 const h=await r.text(); if(!h.includes('/player/'))throw new Error('Pagina fonte non riconosciuta'); return h;
}
export function parseSchedule(html,now=new Date()){
 let day=null,tournament='',pending=null;const result=[];
 for(const token of html.matchAll(/<span\b[^>]*class="tab"[^>]*>([\s\S]*?)<\/span>|<tr\b[^>]*>[\s\S]*?<\/tr>/gi)){
  if(token[1]!==undefined){const d=clean(token[1]).match(/(\d{2})\.\s*(\d{2})\.\s*(\d{4})/);day=d?`${d[3]}-${d[2]}-${d[1]}`:null;pending=null;continue;}
  const row=token[0],cells=[...row.matchAll(/<td\b([^>]*)>([\s\S]*?)<\/td>/gi)];
  if(/class="head\b/.test(row)){tournament=clean(cells[0]?.[2]||'');pending=null;continue;}
  const player=row.match(/<a\b[^>]*href="(\/player\/[^"?#]+)"[^>]*>([\s\S]*?)<\/a>/i);
  if(!player){pending=null;continue;}
  const timeCell=cells.find(c=>/\btime\b/.test(c[1]));
  const started=cells.some(c=>/class="(?:result|score)"/.test(c[1])&&/\d/.test(clean(c[2])))||/retired|walkover|cancelled|postponed/i.test(clean(row));
  if(timeCell){
   pending=null; const time=clean(timeCell[2]).match(/\b\d{2}:\d{2}\b/)?.[0];
   if(!day||!time||started)continue;
   const startsAt=new Date(`${day}T${time}:00+01:00`);
   if(!(startsAt>now)||dayOf(startsAt)!==dayOf(now))continue;
   const odds=cells.filter(c=>/class="coursew?"/.test(c[1])).map(c=>Number(clean(c[2]))||null);
   pending={id:row.match(/match-detail\/\?id=(\d+)/)?.[1]||`${day}-${player[1]}-${time}`,tournament,startsAt:startsAt.toISOString(),p1:clean(player[2]),profiles:[player[1]],odds};
  }else if(pending){if(!started){pending.p2=clean(player[2]);pending.profiles.push(player[1]);result.push(pending);}pending=null;}
 }
 return [...new Map(result.map(m=>[m.id,m])).values()];
}
export function profileStats(html){
 const text=clean(html);const rank=text.match(/Current\/Highest rank\s*-\s*singles:\s*(\d+)/i)?.[1];
 const rows=[...html.matchAll(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi)].map(r=>[...r[0].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(c=>clean(c[1])));
 const year=String(new Date().getUTCFullYear());
 const season=rows.find(r=>r[0]===year&&r.some(c=>/^\d+\/\d+$/.test(c)));
 return {rank:rank?Number(rank):null,seasonColumns:season||null,elo:null,reason:'Elo non disponibile: serve uno storico completo e verificato degli incontri.'};
}

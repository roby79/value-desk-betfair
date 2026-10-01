import {get,json,dayOf,parseSchedule,trackOddsMovement,origin} from '../../lib/source.js';
export async function onRequestGet({env}){
 const now=new Date();const day=dayOf(now),[year,month,date]=day.split('-');
 const source=`${origin}/next/?year=${year}&month=${month}&day=${date}&type=all`;
 try{
  const html=await get(source);
  const matches=parseSchedule(html,now);
  // Ogni lettura del palinsesto (manuale o dal Worker-sveglia orario)
  // aggiorna anche il movimento quota in KV: prima apparizione = apertura
  // fissa, letture successive = quota attuale. Se la KV non e' collegata
  // (env.ODDS_KV assente) le partite restano senza dati di movimento,
  // senza bloccare il resto del palinsesto.
  const kv=env&&env.ODDS_KV;
  await Promise.all(matches.map(async m=>{
   m.movement=await trackOddsMovement(kv,m.id,m.odds);
  }));
  return json({day,updated:now.toISOString(),source,matches});
 }
 catch(e){return json({day,updated:null,matches:[],error:e.message},502);}
}

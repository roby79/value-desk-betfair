import {json,normalizeBetfair,BETFAIR_KV_KEY} from '../../lib/source.js';
// Legge le quote Betfair scritte in KV dal container sul VPS. Sola lettura:
// nessuna credenziale Betfair serve qui.
export async function onRequestGet({env}){
 const kv=env&&env.ODDS_KV;
 if(!kv)return json({updated:null,stale:true,matches:[],error:'KV ODDS_KV non collegata al progetto'},500);
 try{
  const raw=await kv.get(BETFAIR_KV_KEY);
  if(!raw)return json({updated:null,stale:true,matches:[],error:'Nessun dato Betfair in KV: il container sul VPS non ha ancora scritto'},503);
  return json(normalizeBetfair(JSON.parse(raw)));
 }catch(e){return json({updated:null,stale:true,matches:[],error:e.message},502);}
}

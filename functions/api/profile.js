import {get,json,profileStats,origin} from '../../lib/source.js';
export async function onRequestGet({request}){
 const path=new URL(request.url).searchParams.get('path');
 if(!/^\/player\/[a-z0-9-]+\/$/i.test(path||''))return json({error:'Giocatore non valido'},400);
 try{return json({...profileStats(await get(path)),source:origin+path,retrievedAt:new Date().toISOString()});}
 catch(e){return json({error:e.message},502);}
}

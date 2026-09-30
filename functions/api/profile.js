import {getPlayerPage,json,profileStats,origin} from '../../lib/source.js';
export async function onRequestGet({request}){
 const url=new URL(request.url);
 const path=url.searchParams.get('path');
 const label=url.searchParams.get('label')||null;
 if(!/^\/player\/[a-z0-9-]+\/$/i.test(path||''))return json({error:'Giocatore non valido'},400);
 try{return json({...profileStats(await getPlayerPage(path),label),source:origin+path,retrievedAt:new Date().toISOString()});}
 catch(e){return json({error:e.message},502);}
}

import {fetchMatchOdds,json} from '../../lib/source.js';
export async function onRequestGet({request}){
 const id=new URL(request.url).searchParams.get('id');
 if(!id||!/^\d+$/.test(id))return json({error:'ID partita non valido'},400);
 try{
  const odds=await fetchMatchOdds(id);
  if(!odds)return json({avgOdds:null,openOdds:null,bookmakerCount:0,
   note:'Nessuna riga di quote riconosciuta su questa pagina (sperimentale, struttura non ancora verificata).'});
  return json({...odds,retrievedAt:new Date().toISOString(),
   note:'Sperimentale: la struttura di questa pagina non è stata verificata su un caso reale.'});
 }catch(e){return json({error:e.message},502);}
}

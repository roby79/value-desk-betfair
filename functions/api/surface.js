import {fetchSurface,json} from '../../lib/source.js';
export async function onRequestGet({request}){
 const path=new URL(request.url).searchParams.get('path');
 if(!path||!/^\/[a-z0-9-]+\/20\d\d\/(?:atp-men|wta-women)/i.test(path))return json({error:'Torneo non valido'},400);
 try{
  const surface=await fetchSurface(path);
  return json({surface,retrievedAt:new Date().toISOString(),
   note:'Sperimentale: la struttura di questa pagina non è stata verificata su un caso reale.'});
 }catch(e){return json({error:e.message},502);}
}

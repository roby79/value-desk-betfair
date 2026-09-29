import {get,json,dayOf,parseSchedule,origin} from '../../lib/source.js';
export async function onRequestGet(){
 const now=new Date();const day=dayOf(now),[year,month,date]=day.split('-');
 const source=`${origin}/next/?year=${year}&month=${month}&day=${date}&type=all`;
 try{
  const html=await get(source);
  const matches=parseSchedule(html,now);
  // Diagnostica temporanea: conferma cosa il server ha davvero scaricato,
  // indipendentemente da quanti match il parser è riuscito a estrarre.
  // Da rimuovere una volta risolto il problema del palinsesto scarso.
  const debug={
   htmlLength:html.length,
   containsChengdu:html.toLowerCase().includes('chengdu'),
   containsHurkacz:html.toLowerCase().includes('hurkacz'),
   containsHead:(html.match(/class="head\b/gi)||[]).length,
   containsPlayerLinks:(html.match(/href="\/player\//gi)||[]).length,
  };
  return json({day,updated:now.toISOString(),source,matches,debug});
 }
 catch(e){return json({day,updated:null,matches:[],error:e.message},502);}
}

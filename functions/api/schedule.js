import {get,json,dayOf,parseSchedule,lastParseStats,origin} from '../../lib/source.js';
export async function onRequestGet(){
 const now=new Date();const day=dayOf(now),[year,month,date]=day.split('-');
 const source=`${origin}/next/?year=${year}&month=${month}&day=${date}&type=all`;
 try{
  const html=await get(source);
  const matches=parseSchedule(html,now);
  const debug={
   htmlLength:html.length,
   containsChengdu:html.toLowerCase().includes('chengdu'),
   containsHurkacz:html.toLowerCase().includes('hurkacz'),
   containsHead:(html.match(/class="head\b/gi)||[]).length,
   containsPlayerLinks:(html.match(/href="\/player\//gi)||[]).length,
   parseStats:lastParseStats,
  };
  return json({day,updated:now.toISOString(),source,matches,debug});
 }
 catch(e){return json({day,updated:null,matches:[],error:e.message},502);}
}

import {json,betfairListTennisMatches,betfairMarketBook} from '../../lib/source.js';

// Versione diagnostica temporanea del login: non usa betfairLogin() da
// lib/source.js, chiama direttamente l'endpoint e restituisce la risposta
// grezza cosi' vediamo esattamente cosa torna invece di indovinare.
async function betfairLoginDebug(appKey,username,password){
 const r=await fetch('https://identitysso.betfair.it/api/login',{
  method:'POST',
  headers:{'X-Application':appKey,'Content-Type':'application/x-www-form-urlencoded','Accept':'application/json'},
  body:`username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`,
 });
 const text=await r.text();
 let parsed=null;
 try{parsed=JSON.parse(text);}catch{/* non era JSON */}
 return {httpStatus:r.status,contentType:r.headers.get('content-type'),rawBody:text.slice(0,500),parsed};
}

// Endpoint di SOLO TEST: verifica che login + lettura mercati Betfair
// funzionino con dati veri, prima di collegarli alla pipeline del
// palinsesto/movimento. Da rimuovere (o lasciare, è innocuo) una volta
// confermato che tutto torna.
export async function onRequestGet({env}){
 try{
  const appKey=env.BETFAIR_APP_KEY, username=env.BETFAIR_USERNAME, password=env.BETFAIR_PASSWORD;
  if(!appKey||!username||!password){
   return json({error:'Segreti Betfair non impostati su Cloudflare (BETFAIR_APP_KEY, BETFAIR_USERNAME, BETFAIR_PASSWORD).'},500);
  }
  const debug=await betfairLoginDebug(appKey,username,password);
  if(!debug.parsed||!debug.parsed.sessionToken){
   return json({step:'login',debug});
  }
  const sessionToken=debug.parsed.sessionToken;
  const markets=await betfairListTennisMatches(appKey,sessionToken);
  const marketIds=markets.map(m=>m.marketId);
  const books=await betfairMarketBook(appKey,sessionToken,marketIds);
  const bookById=Object.fromEntries(books.map(b=>[b.marketId,b]));

  const matches=markets.map(m=>{
   const book=bookById[m.marketId];
   const runners=(m.runners||[]).map(r=>{
    const rb=book&&book.runners?book.runners.find(x=>x.selectionId===r.selectionId):null;
    const backPrice=rb&&rb.ex&&rb.ex.availableToBack&&rb.ex.availableToBack[0]?rb.ex.availableToBack[0].price:null;
    return {name:r.runnerName,odds:backPrice};
   });
   return {marketId:m.marketId,event:m.event?m.event.name:null,startTime:m.marketStartTime,runners};
  });

  return json({count:matches.length,matches});
 }catch(e){
  return json({error:e.message},502);
 }
}

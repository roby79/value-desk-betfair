import {test} from 'node:test';import assert from 'node:assert/strict';
import {normalizeBetfair} from '../lib/source.js';

const now=new Date('2026-10-07T10:00:00Z');
const mk=(o)=>({marketId:'1.1',event:'A v B',competition:'ATP Shanghai 2026',startTime:'2026-10-07T12:00:00Z',isDoubles:false,
 runners:[{name:'A',openOdds:2.0,currentOdds:1.8,movePct:-10},{name:'B',openOdds:1.8,currentOdds:2.0,movePct:11.1}],...o});

test('normalizeBetfair converte una partita nel formato della tabella',()=>{
 const r=normalizeBetfair({updatedAt:'2026-10-07T09:50:00Z',matches:[mk()]},now);
 assert.equal(r.stale,false);
 assert.equal(r.matches.length,1);
 const m=r.matches[0];
 assert.equal(m.p1,'A');assert.equal(m.p2,'B');assert.equal(m.tournament,'ATP Shanghai 2026');
 assert.deepEqual(m.movement.openOdds,[2.0,1.8]);
 assert.deepEqual(m.movement.currentOdds,[1.8,2.0]);
 assert.deepEqual(m.movement.movePct,[-10,11.1]);
});

test('normalizeBetfair esclude doppi, ITF e partite gia iniziate',()=>{
 const r=normalizeBetfair({updatedAt:'2026-10-07T09:50:00Z',matches:[
  mk({marketId:'d',event:'A/B v C/D',isDoubles:true}),
  mk({marketId:'i',competition:'ITF W50 Heraklion GRE'}),
  mk({marketId:'s',startTime:'2026-10-07T09:00:00Z'}),
  mk({marketId:'c',competition:'Braga Challenger 2026'}),
 ]},now);
 assert.deepEqual(r.matches.map(m=>m.marketId),['c']);
});

test('normalizeBetfair segnala dati vecchi o assenti',()=>{
 assert.equal(normalizeBetfair({updatedAt:'2026-10-07T08:00:00Z',matches:[]},now).stale,true);
 assert.equal(normalizeBetfair(null,now).stale,true);
});

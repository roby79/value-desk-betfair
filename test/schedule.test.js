import {test} from 'node:test';import assert from 'node:assert/strict';import {parseSchedule,dayOf} from '../lib/source.js';
const row=(score='',time='14:00')=>`<tr><td class="time">${time}</td><td><a href="/player/a/">A</a></td><td class="result">${score}</td><td class="h2h">2</td><td class="course">1.8</td><td class="course">2.1</td><td><a href="/match-detail/?id=1">info</a></td></tr><tr><td><a href="/player/b/">B</a></td><td class="result"></td></tr>`;
test('future today, H2H does not mark started',()=>assert.equal(parseSchedule('<span class="tab">28. 09. 2026</span>'+row(),new Date('2026-09-28T11:00Z')).length,1));
test('exclude previous day and scored matches',()=>{assert.equal(parseSchedule('<span class="tab">27. 09. 2026</span>'+row(),new Date('2026-09-28T11:00Z')).length,0);assert.equal(parseSchedule('<span class="tab">28. 09. 2026</span>'+row('1'),new Date('2026-09-28T11:00Z')).length,0)});
test('Italian midnight',()=>assert.equal(dayOf(new Date('2026-09-28T22:30Z')),'2026-09-29'));
test('a normal tournament header is kept as the tournament name',()=>{
 const html='<span class="tab">28. 09. 2026</span><tr class="head"><td>Rotterdam</td></tr>'+row();
 assert.equal(parseSchedule(html,new Date('2026-09-28T11:00Z'))[0].tournament,'Rotterdam');
});
test('a "live streams" ticker header is treated as unidentified, and unidentified matches are filtered out',()=>{
 const html='<span class="tab">28. 09. 2026</span><tr class="head"><td>13:30 Live streams bet365 Unibet</td></tr>'+row();
 assert.equal(parseSchedule(html,new Date('2026-09-28T11:00Z')).length,0);
});
test('matches without a real published market (empty odds cells) are filtered out',()=>{
 const now=new Date('2026-09-28T11:00Z');
 const noOddsRow=(time='14:00')=>`<tr><td class="time">${time}</td><td><a href="/player/a/">A</a></td><td class="result"></td><td class="course"></td><td class="course"></td></tr><tr><td><a href="/player/b/">B</a></td><td class="result"></td></tr>`;
 const withNoOdds='<span class="tab">28. 09. 2026</span><tr class="head"><td>Rotterdam</td></tr>'+noOddsRow();
 assert.equal(parseSchedule(withNoOdds,now).length,0);
 const withOdds='<span class="tab">28. 09. 2026</span><tr class="head"><td>Rotterdam</td></tr>'+row();
 assert.equal(parseSchedule(withOdds,now).length,1);
});
test('minor tournaments (and unidentified ones) are filtered out entirely',()=>{
 const now=new Date('2026-09-28T11:00Z');
 const minorNames=['Futures 2026','UTR Pro Tennis Series 3','Antalya 6 ITF','Roma M15'];
 for(const name of minorNames){
  const html=`<span class="tab">28. 09. 2026</span><tr class="head"><td>${name}</td></tr>`+row();
  assert.equal(parseSchedule(html,now).length,0,name+' should have been filtered out');
 }
 const html='<span class="tab">28. 09. 2026</span><tr class="head"><td>Rotterdam</td></tr>'+row();
 assert.equal(parseSchedule(html,now).length,1);
});

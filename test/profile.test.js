import {test} from 'node:test';import assert from 'node:assert/strict';import {profileStats} from '../lib/source.js';
import {eloDaStorico, calcolaProbabilitaVittoria, combinaLogOdds} from '../lib/elo.js';

const fixture=`
<div>Current/Highest rank - singles: 70. / 6.</div>
<table>
<tr><th>Year</th><th>Summary</th><th>Clay</th><th>Hard</th><th>Indoors</th><th>Grass</th><th>Not set</th></tr>
<tr><td>Summary:</td><td>426/253</td><td>114/67</td><td>197/98</td><td>76/63</td><td>30/16</td><td>9/9</td></tr>
<tr><td>2026</td><td>5/4</td><td>-</td><td>5/2</td><td>0/2</td><td>-</td><td>-</td></tr>
</table>
<table>
<tr><td>Rotterdam</td><td>Round</td><td>Result</td><td>H</td><td>A</td></tr>
<tr><td>11.02.</td><td>Bublik A. - Hurkacz H.</td><td>1R</td><td>62-7, 7-61, 7-5</td><td>1.70</td><td>2.14</td></tr>
</table>
<table>
<tr><td>Australian Open</td><td>Round</td><td>Result</td><td>H</td><td>A</td></tr>
<tr><td>22.01.</td><td>Quinn E. - Hurkacz H.</td><td>2R</td><td>6-4, 7-65, 6-1</td><td>3.97</td><td>1.24</td></tr>
<tr><td>20.01.</td><td>Hurkacz H. - Bergs Z.</td><td>1R</td><td>66-7, 7-66, 6-3, 6-3</td><td>1.38</td><td>3.03</td></tr>
</table>
`;

test('reads rank, season row and recent matches, crediting the win to whoever is listed first', () => {
  const s = profileStats(fixture, 'Hurkacz H.');
  assert.equal(s.rank, 70);
  assert.deepEqual(s.seasonColumns, ['2026', '5/4', '-', '5/2', '0/2', '-', '-']);
  assert.equal(s.recent.length, 3);
  assert.equal(s.recent[0].opponent, 'Bublik A.');
  assert.equal(s.recent[0].won, false);
  assert.equal(s.recent[2].opponent, 'Bergs Z.');
  assert.equal(s.recent[2].won, true);
});

test('recent matches also carry the historical odds for our player and the opponent', () => {
  const s = profileStats(fixture, 'Hurkacz H.');
  // 11.02.: Bublik A. - Hurkacz H., quote 1.70/2.14 -> Hurkacz (secondo) ha 2.14, Bublik 1.70
  assert.equal(s.recent[0].ownOdds, 2.14);
  assert.equal(s.recent[0].oppOdds, 1.70);
  // 20.01.: Hurkacz H. - Bergs Z., quote 1.38/3.03 -> Hurkacz (primo) ha 1.38
  assert.equal(s.recent[2].ownOdds, 1.38);
  assert.equal(s.recent[2].oppOdds, 3.03);
});

test('without a matching label, recent stays null instead of guessing', () => {
  const s = profileStats(fixture, null);
  assert.equal(s.recent, null);
});

test('the full pipeline (profilo reale + Elo da storico + log-odds) favours the stronger profile', () => {
  const strongProfile = profileStats(fixture, 'Hurkacz H.');
  const weakProfile = { rank: 250, seasonColumns: ['2026', '12/18', null, null, null, null, null], recent: [{opponent:'X',won:false},{opponent:'Y',won:false},{opponent:'Z',won:true},{opponent:'W',won:false}] };

  const pair=s=>{const m=s&&String(s).match(/^(\d+)\/(\d+)$/);return m?{w:+m[1],l:+m[2]}:null;};
  const rate=p=>p?(p.w+1)/(p.w+p.l+2):null;
  const rankShare=(1/strongProfile.rank)/(1/strongProfile.rank+1/weakProfile.rank);
  const rA=rate(pair(strongProfile.seasonColumns[1])), rB=rate(pair(weakProfile.seasonColumns[1]));
  const seasonShare=rA/(rA+rB);
  const eloA=eloDaStorico(strongProfile.recent,'Hurkacz H.').elo;
  const eloB=eloDaStorico(weakProfile.recent,'Rivale').elo;
  const eloShare=calcolaProbabilitaVittoria(eloA,eloB);

  const combined = combinaLogOdds([[0.45,seasonShare],[0.25,rankShare],[0.30,eloShare]]);
  assert.equal(combined.componentiUsate, 3);
  assert.ok(combined.prob > 0.5 && combined.prob < 1);
});

test('missing data on both sides refuses to invent a probability', () => {
  const combined = combinaLogOdds([[0.45,null],[0.25,null],[0.30,null]]);
  assert.equal(combined, null);
});

import {test} from 'node:test';import assert from 'node:assert/strict';import {profileStats,estimateProbability} from '../lib/source.js';

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

test('without a matching label, recent stays null instead of guessing', () => {
  const s = profileStats(fixture, null);
  assert.equal(s.recent, null);
});

test('estimateProbability blends the three components and favours the stronger profile', () => {
  const strong = profileStats(fixture, 'Hurkacz H.');
  const weak = { rank: 250, seasonColumns: ['2026', '12/18', null, null, null, null, null], recent: [{won:false},{won:false},{won:true},{won:false}] };
  const est = estimateProbability(strong, weak);
  assert.equal(est.componentsUsed, 3);
  assert.ok(est.prob > 0.5 && est.prob < 1);
});

test('missing data on both sides refuses to invent a probability', () => {
  const empty = { rank: null, seasonColumns: null, recent: null };
  const est = estimateProbability(empty, empty);
  assert.equal(est.prob, null);
  assert.match(est.reason, /Dati insufficienti/);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSchedule, upcoming } from '../netlify/functions/schedule.mts';
import { parseRecent } from '../netlify/functions/analysis.mts';
const fixture = (time, a, b, score = '', h2h = '0') => `<tr><td>${time}</td><td><a href="/player/${a}/">${a}</a></td><td>${score}</td><td></td><td>${h2h}</td><td>1.80</td><td>2.10</td><td><a href="/match-detail/?id=123">info</a></td></tr><tr><td><a href="/player/${b}/">${b}</a></td><td>${score}</td><td></td><td>2</td></tr>`;
const page = rows => `<table><tr><td><a href="/test/2026/atp-men/">Test</a></td><td>S</td><td>1</td><td>H2H</td><td>H</td><td>A</td></tr>${rows}</table>`;
test('H2H 0/2 must not exclude a scheduled match; scored matches are excluded', () => {
 const parsed = parseSchedule(page(fixture('12:00', 'a','b') + fixture('12:30','c','d','1') + fixture('13:00','e','f')));
 assert.deepEqual(parsed.map(m => [m.p1,m.p2]), [['a','b'],['e','f']]);
 assert.deepEqual(parsed[0].odds, [1.8,2.1]);
});
test('only starts strictly after the search time survive', () => {
 const parsed = parseSchedule(page(fixture('11:00','a','b')+fixture('11:01','c','d')));
 const result = upcoming(parsed, new Date('2026-09-23T10:00:30Z'));
 assert.equal(result.length,1);
 assert.equal(result[0].startsAt,'2026-09-23T11:01:00+01:00');
});
test('orphan player rows cannot be paired with the next match', () => {
 const orphan = '<tr><td>12:00</td><td><a href="/player/orphan/">Orphan</a></td><td></td></tr>';
 const parsed = parseSchedule(page(orphan+fixture('13:00','a','b')));
 assert.deepEqual(parsed.map(m => [m.p1,m.p2]),[['a','b']]);
});
test('recent form uses score orientation and ignores unfinished scores and doubles', () => {
 const row = (id, first, second, score) => `<tr><td>22.09.</td><td><a href="/player/${first}/">${first}</a> - <a href="/player/${second}/">${second}</a></td><td><a href="/match-detail/?id=${id}">${score}</a></td></tr>`;
 const html = '<table>'+row(1,'self','other','6-2, 6-3')+row(2,'other','self','6-2, 6-3')+row(3,'self','other','6-2, 2-1')+'</table>';
 assert.deepEqual(parseRecent(html,'/player/self/'),{wins:1, losses:1});
});
test('date headings prevent previous-day fixtures from entering today', () => {
 const html = '<div>22. 09. 2026</div>'+page(fixture('23:00','a','b'))+'<div>23. 09. 2026</div>'+page(fixture('13:00','c','d'));
 assert.deepEqual(parseSchedule(html,'2026-09-23').map(m=>m.p1),['c']);
});
test('Italy day boundary excludes tomorrow and includes late source-day starts after midnight', () => {
 const parsed = parseSchedule(page(fixture('23:30','a','b')));
 assert.equal(upcoming(parsed,new Date('2026-09-23T20:00:00Z'),'2026-09-23').length,0);
 assert.equal(upcoming(parsed,new Date('2026-09-23T22:15:00Z'),'2026-09-23').length,1);
});

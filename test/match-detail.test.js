import {test} from 'node:test';import assert from 'node:assert/strict';
import {fetchSurface, fetchMatchOdds} from '../lib/source.js';

function mockFetchOnce(html, status = 200) {
  const original = global.fetch;
  global.fetch = async () => ({ ok: status < 300, status, text: async () => html });
  return () => { global.fetch = original; };
}

test('fetchSurface finds the surface named in parentheses near the tournament title', async () => {
  const restore = mockFetchOnce('<h1>Chengdu</h1><div>(1.210.115 $, hard, men)</div><a href="/player/x/">x</a>');
  try {
    const s = await fetchSurface('/chengdu/2026/atp-men/');
    assert.equal(s, 'hard');
  } finally { restore(); }
});

test('fetchSurface returns null without a tournament URL or when nothing is found', async () => {
  assert.equal(await fetchSurface(null), null);
  const restore = mockFetchOnce('<h1>Some Tournament</h1><p>no surface mentioned here</p>');
  try {
    assert.equal(await fetchSurface('/x/2026/atp-men/'), null);
  } finally { restore(); }
});

test('fetchMatchOdds averages multiple bookmaker rows and separates an opening-odds row', async () => {
  const html = `
    <table>
      <tr><td>Opening</td><td>1.90</td><td>1.95</td></tr>
      <tr><td>bet365</td><td>1.80</td><td>2.05</td></tr>
      <tr><td>1xBet</td><td>1.82</td><td>2.00</td></tr>
    </table>
  `;
  const restore = mockFetchOnce(html);
  try {
    const r = await fetchMatchOdds('3335520');
    assert.equal(r.bookmakerCount, 2);
    assert.equal(r.avgOdds[0], 1.81);
    assert.equal(r.avgOdds[1], 2.02);
    assert.deepEqual(r.openOdds, [1.90, 1.95]);
  } finally { restore(); }
});

test('fetchMatchOdds returns null without an id or when the page has no odds-like rows', async () => {
  assert.equal(await fetchMatchOdds(null), null);
  const restore = mockFetchOnce('<table><tr><td>no odds here</td></tr></table>');
  try {
    assert.equal(await fetchMatchOdds('1'), null);
  } finally { restore(); }
});

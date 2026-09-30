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

test('fetchMatchOdds averages plausible two-way rows and now leaves openOdds null (not reliable enough yet)', async () => {
  const html = `
    <table>
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
    assert.equal(r.openOdds, null);
  } finally { restore(); }
});

test('fetchMatchOdds drops an entire row when its first pair fails the plausibility check, e.g. a totals threshold before that market\'s own odds', async () => {
  // Riproduce il caso reale trovato in produzione: una riga con una soglia
  // "22.5" (mercato Over/Under) seguita da quote di quel mercato. Le prime
  // due "quote" lette sarebbero 22.5 e 1.90, che falliscono il controllo di
  // plausibilità - l'intera riga va scartata, non recuperata con un'altra
  // coppia (che potrebbe comunque appartenere a un mercato diverso).
  const html = `
    <table>
      <tr><td>bet365</td><td>2.35</td><td>1.58</td></tr>
      <tr><td>1xBet</td><td>2.40</td><td>1.55</td></tr>
      <tr><td>bet365 Over/Under</td><td>22.5</td><td>1.90</td><td>1.95</td></tr>
    </table>
  `;
  const restore = mockFetchOnce(html);
  try {
    const r = await fetchMatchOdds('3335232');
    assert.equal(r.bookmakerCount, 2);
    assert.equal(r.avgOdds[0], 2.38);
    assert.equal(r.avgOdds[1], 1.56);
  } finally { restore(); }
});

test('fetchMatchOdds returns null without an id or when the page has no odds-like rows', async () => {
  assert.equal(await fetchMatchOdds(null), null);
  const restore = mockFetchOnce('<table><tr><td>no odds here</td></tr></table>');
  try {
    assert.equal(await fetchMatchOdds('1'), null);
  } finally { restore(); }
});

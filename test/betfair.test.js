import {test} from 'node:test';import assert from 'node:assert/strict';
import {betfairLogin, betfairListTennisMatches, betfairMarketBook} from '../lib/source.js';

function mockFetchSequence(responses){
  const original = global.fetch;
  let i = 0;
  global.fetch = async (url, opts) => {
    const r = responses[Math.min(i, responses.length - 1)];
    i++;
    return { ok: r.status ? r.status < 300 : true, status: r.status || 200, json: async () => r.body, url, opts };
  };
  return () => { global.fetch = original; };
}

test('betfairLogin returns the session token on success', async () => {
  const restore = mockFetchSequence([{ body: { sessionToken: 'abc123', loginStatus: 'SUCCESS' } }]);
  try {
    const token = await betfairLogin('key', 'user', 'pass');
    assert.equal(token, 'abc123');
  } finally { restore(); }
});

test('betfairLogin throws a clear error when credentials are wrong', async () => {
  const restore = mockFetchSequence([{ body: { loginStatus: 'INVALID_USERNAME_OR_PASSWORD' } }]);
  try {
    await assert.rejects(() => betfairLogin('key', 'user', 'wrong'), /INVALID_USERNAME_OR_PASSWORD/);
  } finally { restore(); }
});

test('betfairLogin throws on a non-OK HTTP response', async () => {
  const restore = mockFetchSequence([{ status: 503, body: {} }]);
  try {
    await assert.rejects(() => betfairLogin('key', 'user', 'pass'), /HTTP 503/);
  } finally { restore(); }
});

test('betfairListTennisMatches returns the market list from a successful JSON-RPC call', async () => {
  const restore = mockFetchSequence([{ body: { result: [
    { marketId: '1.111', event: { name: 'Djokovic v Alcaraz' }, marketStartTime: '2026-10-02T10:00:00Z',
      runners: [{ selectionId: 1, runnerName: 'Djokovic N.' }, { selectionId: 2, runnerName: 'Alcaraz C.' }] },
  ] } }]);
  try {
    const markets = await betfairListTennisMatches('key', 'token');
    assert.equal(markets.length, 1);
    assert.equal(markets[0].event.name, 'Djokovic v Alcaraz');
  } finally { restore(); }
});

test('betfairListTennisMatches surfaces a JSON-RPC error clearly', async () => {
  const restore = mockFetchSequence([{ body: { error: { message: 'INVALID_SESSION_INFORMATION' } } }]);
  try {
    await assert.rejects(() => betfairListTennisMatches('key', 'badtoken'), /INVALID_SESSION_INFORMATION/);
  } finally { restore(); }
});

test('betfairMarketBook returns an empty array without hitting the network when there are no market ids', async () => {
  const restore = mockFetchSequence([{ body: { result: [{ should: 'not be reached' }] } }]);
  try {
    const books = await betfairMarketBook('key', 'token', []);
    assert.deepEqual(books, []);
  } finally { restore(); }
});

test('betfairMarketBook returns the book list when market ids are given', async () => {
  const restore = mockFetchSequence([{ body: { result: [
    { marketId: '1.111', runners: [{ selectionId: 1, ex: { availableToBack: [{ price: 1.85, size: 120 }] } }] },
  ] } }]);
  try {
    const books = await betfairMarketBook('key', 'token', ['1.111']);
    assert.equal(books[0].runners[0].ex.availableToBack[0].price, 1.85);
  } finally { restore(); }
});

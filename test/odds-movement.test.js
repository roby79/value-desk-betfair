import {test} from 'node:test';import assert from 'node:assert/strict';
import {trackOddsMovement} from '../lib/source.js';

function fakeKV(){
  const store = new Map();
  return {
    store,
    get: async (key) => store.has(key) ? store.get(key) : null,
    put: async (key, value) => { store.set(key, value); },
  };
}

test('first sighting of a match records its odds as the opening, with zero movement', async () => {
  const kv = fakeKV();
  const r = await trackOddsMovement(kv, '123', [1.80, 2.10]);
  assert.deepEqual(r.openOdds, [1.80, 2.10]);
  assert.deepEqual(r.currentOdds, [1.80, 2.10]);
  assert.deepEqual(r.movePct, [0, 0]);
});

test('a later call keeps the opening fixed and updates the current odds, computing movement', async () => {
  const kv = fakeKV();
  await trackOddsMovement(kv, '123', [1.80, 2.10]);
  const r2 = await trackOddsMovement(kv, '123', [1.70, 2.25]);
  assert.deepEqual(r2.openOdds, [1.80, 2.10]); // invariata
  assert.deepEqual(r2.currentOdds, [1.70, 2.25]);
  // (1.70-1.80)/1.80*100 = -5.6 (quota accorciata, steam)
  assert.equal(r2.movePct[0], -5.6);
  // (2.25-2.10)/2.10*100 = +7.1 (quota allungata, drift)
  assert.equal(r2.movePct[1], 7.1);
});

test('different match ids are tracked independently', async () => {
  const kv = fakeKV();
  await trackOddsMovement(kv, 'A', [1.50, 2.80]);
  await trackOddsMovement(kv, 'B', [3.00, 1.40]);
  const a = await trackOddsMovement(kv, 'A', [1.45, 2.95]);
  const b = await trackOddsMovement(kv, 'B', [3.00, 1.40]);
  assert.deepEqual(a.openOdds, [1.50, 2.80]);
  assert.deepEqual(b.openOdds, [3.00, 1.40]);
  assert.deepEqual(b.movePct, [0, 0]);
});

test('returns null gracefully when kv, matchId or odds are missing/invalid', async () => {
  const kv = fakeKV();
  assert.equal(await trackOddsMovement(null, '1', [1.8, 2.1]), null);
  assert.equal(await trackOddsMovement(kv, null, [1.8, 2.1]), null);
  assert.equal(await trackOddsMovement(kv, '1', [1.8]), null);
  assert.equal(await trackOddsMovement(kv, '1', null), null);
});

test('a kv.put failure does not prevent returning the movement computed so far', async () => {
  const kv = fakeKV();
  kv.put = async () => { throw new Error('KV down'); };
  const r = await trackOddsMovement(kv, '1', [1.8, 2.1]);
  assert.deepEqual(r.openOdds, [1.8, 2.1]);
});

test('a kv.get failure is treated as "no prior record" rather than crashing', async () => {
  const kv = fakeKV();
  kv.get = async () => { throw new Error('KV down'); };
  const r = await trackOddsMovement(kv, '1', [1.8, 2.1]);
  assert.deepEqual(r.openOdds, [1.8, 2.1]);
  assert.deepEqual(r.movePct, [0, 0]);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PlayerStats, eloDaStorico, calcolaProbabilitaVittoria, bonusH2H } from '../lib/elo.js';

test('a win against an average opponent raises Elo, a loss lowers it', () => {
  const p = new PlayerStats('A.');
  const before = p.elo;
  p.aggiornaElo({ avversario: 'B.', risultato: 1 });
  assert.ok(p.elo > before);
  const afterWin = p.elo;
  p.aggiornaElo({ avversario: 'C.', risultato: 0 });
  assert.ok(p.elo < afterWin);
});

test('h2h record accumulates per opponent', () => {
  const p = new PlayerStats('A.');
  p.aggiornaElo({ avversario: 'B.', risultato: 1 });
  p.aggiornaElo({ avversario: 'B.', risultato: 0 });
  p.aggiornaElo({ avversario: 'B.', risultato: 1 });
  assert.deepEqual(p.h2h['B.'], { vittorie: 2, sconfitte: 1 });
});

test('eloDaStorico replays oldest-first and returns base 1500 with no history', () => {
  const empty = eloDaStorico(null, 'A.');
  assert.equal(empty.elo, 1500);
  const recent = [
    { opponent: 'C.', won: true },  // più recente
    { opponent: 'B.', won: true },  // più vecchia
  ];
  const p = eloDaStorico(recent, 'A.');
  assert.equal(p.h2h['B.'].vittorie, 1);
  assert.equal(p.h2h['C.'].vittorie, 1);
  assert.ok(p.elo > 1500);
});

test('calcolaProbabilitaVittoria favours the higher Elo and clamps to [0,1]', () => {
  assert.ok(calcolaProbabilitaVittoria(1600, 1500) > 0.5);
  assert.ok(calcolaProbabilitaVittoria(1500, 1600) < 0.5);
  assert.equal(calcolaProbabilitaVittoria(3000, 100, 1), 1);
  assert.equal(calcolaProbabilitaVittoria(100, 3000, -1), 0);
});

test('bonusH2H rewards a positive head-to-head record and is capped at ±0.05', () => {
  const manyWins = Array.from({ length: 10 }, () => ({ opponent: 'B.', won: true }));
  assert.equal(bonusH2H(manyWins, 'B.'), 0.05);
  const manyLosses = Array.from({ length: 10 }, () => ({ opponent: 'B.', won: false }));
  assert.equal(bonusH2H(manyLosses, 'B.'), -0.05);
  assert.equal(bonusH2H(null, 'B.'), 0);
  assert.equal(bonusH2H([{ opponent: 'C.', won: true }], 'B.'), 0);
});

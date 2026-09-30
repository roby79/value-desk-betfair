import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PlayerStats, eloDaStorico, calcolaProbabilitaVittoria, bonusH2H, ratingDeviation, shrinkByConfidence, combinaLogOdds } from '../lib/elo.js';

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

test('a historical odds value drives the Elo update instead of the flat 1500 fallback', () => {
  // Vittoria "a sorpresa" (quota alta = avversario dato per favorito):
  // deve alzare l'Elo molto più che una vittoria a quota bassa (scontata).
  const surprise = eloDaStorico([{ opponent: 'X', won: true, ownOdds: 4.0 }], 'A.');
  const expected = eloDaStorico([{ opponent: 'X', won: true, ownOdds: 1.2 }], 'A.');
  assert.ok(surprise.elo > expected.elo);
});

test('eloDaStorico falls back to the flat-1500 assumption when no historical odds are known', () => {
  const noOdds = eloDaStorico([{ opponent: 'X', won: true }], 'A.');
  assert.ok(noOdds.elo > 1500);
});

test('ratingDeviation is high with no matches and shrinks toward the floor with more', () => {
  assert.equal(ratingDeviation(0), 350);
  assert.ok(ratingDeviation(10) < ratingDeviation(2));
  assert.ok(ratingDeviation(1000) >= 50);
});

test('shrinkByConfidence pulls thin-data estimates toward 0.5 and leaves solid ones mostly intact', () => {
  assert.equal(shrinkByConfidence(0.9, 0), 0.5);
  const shrunkThin = shrinkByConfidence(0.9, 1);
  const shrunkSolid = shrinkByConfidence(0.9, 10);
  assert.ok(shrunkThin < shrunkSolid);
  assert.ok(shrunkSolid > 0.7 && shrunkSolid < 0.9);
});

test('combinaLogOdds ignores missing components and returns null with none available', () => {
  assert.equal(combinaLogOdds([[1, null], [1, null]]), null);
  const r = combinaLogOdds([[0.5, 0.7], [0.5, null]]);
  assert.equal(r.componentiUsate, 1);
  assert.ok(Math.abs(r.prob - 0.7) < 1e-9);
});

test('combinaLogOdds agrees with all components exactly when they all agree', () => {
  const r = combinaLogOdds([[1, 0.7], [1, 0.7], [1, 0.7]]);
  assert.ok(Math.abs(r.prob - 0.7) < 1e-9);
});

test('combinaLogOdds is not simply the linear average when components disagree', () => {
  // La combinazione in log-odds è il modo statisticamente corretto di sommare
  // fonti indipendenti (come nell'aggiornamento bayesiano) - non è pensata
  // per essere "più prudente" della media lineare, anzi può essere più decisa
  // quando le fonti concordano parzialmente. È shrinkByConfidence (Glicko),
  // non questa funzione, a tenere a bada l'eccesso di sicurezza sui dati scarsi.
  const linear = (0.99 + 0.5 + 0.5) / 3;
  const r = combinaLogOdds([[1, 0.99], [1, 0.5], [1, 0.5]]);
  assert.ok(Math.abs(r.prob - linear) > 0.01);
});

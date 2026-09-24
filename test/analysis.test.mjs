import assert from 'node:assert/strict';
import { test } from 'node:test';
import { evaluate, parseProfile, parseSurface, parseHeadToHead } from '../netlify/functions/analysis.mts';
const year = new Date().getUTCFullYear();
const profile = (rank, season, hard) => `<div>Current/Highest rank - singles: ${rank}. / ${rank}.</div><table><tr><th>Year</th><th>Summary</th><th>Clay</th><th>Hard</th><th>Indoors</th><th>Grass</th></tr><tr><td>${year}</td><td>${season}</td><td>4/3</td><td>${hard}</td><td>-</td><td>-</td></tr></table>`;
const strong = parseProfile(profile(10, '40/12', '20/5'));
const weak = parseProfile(profile(80, '22/20', '8/12'));
test('extracts the singles ranking, yearly and surface records', () => {
  assert.equal(strong.rank, 10);
  assert.deepEqual(strong.surfaces.hard, { wins: 20, losses: 5 });
  assert.equal(parseSurface('<h1>Chengdu</h1>(1,210,115 $, hard, men)'), 'hard');
});
test('rejects missing surface and small samples rather than calling them opportunities', () => {
  assert.equal(evaluate([1.8, 2.1], strong, weak, null).status, 'insufficient');
  assert.equal(evaluate([1.8, 2.1], { ...strong, surfaces: { hard: { wins: 2, losses: 1 } } }, weak, 'hard').status, 'insufficient');
});
test('uses the favorite even when listed second, and excludes out-of-range odds', () => {
  const result = evaluate([2.2, 1.8], weak, strong, 'hard', [1, 2]);
  assert.deepEqual(result.factors?.rank, [10, 80]);
  assert.deepEqual(result.factors?.h2h, [2, 1]);
  assert.deepEqual(parseHeadToHead('<h2>Head-to-head: 0 - 2</h2>'), [0, 2]);
  assert.equal(evaluate([1.3, 4], strong, weak, 'hard').status, 'outside');
});

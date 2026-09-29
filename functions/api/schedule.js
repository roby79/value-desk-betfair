import { get, json, dayOf, parseSchedule, lastParseStats, origin } from '../../lib/source.js';
import { calcolaProbabilitaVittoria } from '../../lib/elo.js';

function sempliceSegnaleValueBet(matches) {
  const DEFAULT_ELO = 1500;

  return matches.map(match => {
    const eloP1 = DEFAULT_ELO;
    const eloP2 = DEFAULT_ELO;

    // Calcola probabilità Elo giocatore 1
    const probEloP1 = calcolaProbabilitaVittoria(eloP1, eloP2);

    // Probabilità implicite da quote
    const probQuoteP1 = 1 / match.odds[0];
    const probQuoteP2 = 1 / match.odds[1];

    // Differenza fra Elo e quote (per p1)
    const diff = probEloP1 - probQuoteP1;

    let signal = 'Nessuna azione';
    if (diff > 0.05) {
      signal = `Punta su ${match.p1}`;
    } else if (-diff > 0.05) {
      signal = `Banca ${match.p1}`;
    }

    return { ...match, signal };
  });
}

export async function onRequestGet() {
  const now = new Date();
  const day = dayOf(now),
    [year, month, date] = day.split('-');
  const source = `${origin}/next/?year=${year}&month=${month}&day=${date}&type=all`;
  try {
    const html = await get(source);
    const matches = parseSchedule(html, now);
    const matchesWithSignal = sempliceSegnaleValueBet(matches);

    const debug = {
      htmlLength: html.length,
      containsChengdu: html.toLowerCase().includes('chengdu'),
      containsHurkacz: html.toLowerCase().includes('hurkacz'),
      containsHead: (html.match(/class="head\b/gi) || []).length,
      containsPlayerLinks: (html.match(/href="\/player\//gi) || []).length,
      parseStats: lastParseStats,
    };
    return json({ day, updated: now.toISOString(), source, matches: matchesWithSignal, debug });
  } catch (e) {
    return json({ day, updated: null, matches: [], error: e.message }, 502);
  }
}

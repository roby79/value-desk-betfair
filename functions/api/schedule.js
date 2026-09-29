import { get, json, dayOf, parseSchedule, lastParseStats, origin, profileStats } from '../../lib/source.js';
import { PlayerStats, calcolaProbabilitaVittoria } from '../../lib/elo.js';

// Mappa nome giocatore -> PlayerStats
const playersMap = new Map();

// Funzione per scaricare e aggiornare Elo di un giocatore con profilo reale
async function aggiornaEloGiocatore(profilePath, playerName) {
  try {
    const profileHtml = await get(profilePath);
    const stats = profileStats(profileHtml, playerName);

    let playerStats = playersMap.get(playerName);
    if (!playerStats) {
      playerStats = new PlayerStats(playerName);
      playersMap.set(playerName, playerStats);
    }

    if (stats.recent && stats.recent.length) {
      stats.recent.forEach(match => {
        playerStats.aggiornaElo({
          avversario: match.opponent,
          superficie: 'cemento',    // per ora fisso, poi si può mappare
          risultato: match.won ? 1 : 0,
          eloAvversario: 1500,
          data: match.date
        });
      });
    }

    return playerStats;
  } catch (e) {
    console.warn(`Errore caricando profilo ${playerName}: ${e.message}`);
    return null;
  }
}

async function aggiornaEloTuttiGiocatori(matches) {
  const promises = [];
  const uniquePlayers = new Set();
  matches.forEach(m => {
    if (m.profiles && m.profiles.length) {
      m.profiles.forEach(p => uniquePlayers.add(p));
    }
  });

  for (const profilePath of uniquePlayers) {
    // Recupera nome da match (se possibile)
    const matchForPlayer = matches.find(m => m.profiles.includes(profilePath));
    const playerName = matchForPlayer ? matchForPlayer.p1 === profilePath ? matchForPlayer.p1 : matchForPlayer.p2 : profilePath;

    promises.push(aggiornaEloGiocatore(profilePath, playerName));
  }
  await Promise.all(promises);
}

function segnalaConElo(matches) {
  return matches.map(match => {
    const p1Name = match.p1;
    const p2Name = match.p2;

    const p1Stats = playersMap.get(match.profiles[0]) || new PlayerStats(p1Name);
    const p2Stats = playersMap.get(match.profiles[1]) || new PlayerStats(p2Name);

    const h2hBonus = (p1Stats.h2h[p2Name]?.vittorie ?? 0) - (p1Stats.h2h[p2Name]?.sconfitte ?? 0) > 0 ? 0.03 : 0;
    const probEloP1 = calcolaProbabilitaVittoria(p1Stats.eloTotale, p2Stats.eloTotale, h2hBonus);

    const probQuoteP1 = 1 / match.odds[0];
    const probQuoteP2 = 1 / match.odds[1];

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

    await aggiornaEloTuttiGiocatori(matches);

    const matchesWithSignal = segnalaConElo(matches);

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

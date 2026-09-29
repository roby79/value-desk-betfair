// lib/elo.js

class PlayerStats {
  constructor(name) {
    this.name = name;
    this.eloTotale = 1500;       // Elo base iniziale
    this.eloSuperficie = {
      terra: 1500,
      erba: 1500,
      cemento: 1500
    };
    this.h2h = {};               // Record testa a testa { avversario: { vittorie, sconfitte } }
    this.ultimePartite = [];     // Array con dati ultime partite (es: {avversario, superficie, risultato (1/0), data, eloAvversario})
  }

  aggiornaElo(nuovaPartita, K = 20) {
    // nuovaPartita: {avversario, superficie, risultato (1=vinto, 0=perso), eloAvversario, data}

    // Calcolo probabilità base usando eloTotale
    const expected = 1 / (1 + Math.pow(10, (nuovaPartita.eloAvversario - this.eloTotale) / 400));
    this.eloTotale = this.eloTotale + K * (nuovaPartita.risultato - expected);

    // Calcolo probabilità base per superficie
    const eloSurfaceCurrent = this.eloSuperficie[nuovaPartita.superficie] || 1500;
    const expectedSurface = 1 / (1 + Math.pow(10, (nuovaPartita.eloAvversario - eloSurfaceCurrent) / 400));
    this.eloSuperficie[nuovaPartita.superficie] = eloSurfaceCurrent + K * (nuovaPartita.risultato - expectedSurface);

    // Aggiorna ultime partite mantenendo solo le ultime 10
    this.ultimePartite.unshift(nuovaPartita);
    if (this.ultimePartite.length > 10) this.ultimePartite.pop();

    // Aggiorna H2H
    if (!this.h2h[nuovaPartita.avversario]) {
      this.h2h[nuovaPartita.avversario] = { vittorie: 0, sconfitte: 0 };
    }
    if (nuovaPartita.risultato === 1) {
      this.h2h[nuovaPartita.avversario].vittorie += 1;
    } else {
      this.h2h[nuovaPartita.avversario].sconfitte += 1;
    }
  }
}

/**
 * Calcola la probabilità di vittoria del giocatore A contro B data l'Elo.
 * @param {number} eloA Elo del giocatore A
 * @param {number} eloB Elo del giocatore B
 * @param {number} h2hBonus Bonus/malus da testa a testa (valore tra -0.05 e +0.05 tipicamente)
 * @returns {number} probabilità stimata (0..1)
 */
function calcolaProbabilitaVittoria(eloA, eloB, h2hBonus = 0) {
  let baseProb = 1 / (1 + Math.pow(10, (eloB - eloA) / 400));
  let probAggiustata = baseProb + h2hBonus;
  if (probAggiustata > 1) probAggiustata = 1;
  if (probAggiustata < 0) probAggiustata = 0;
  return probAggiustata;
}

module.exports = { PlayerStats, calcolaProbabilitaVittoria };

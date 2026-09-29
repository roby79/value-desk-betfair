// Elo incrementale per giocatore, ricostruito ogni volta dalle ultime
// partite lette dal profilo (lib/source.js:profileStats). Non è un Elo
// storico persistente su tutta la carriera: parte sempre da 1500 e rigioca
// solo le partite recenti disponibili (fino a 10), assumendo che ogni
// avversario di quelle partite fosse anch'esso a 1500 - un'approssimazione
// dichiarata, non un dato inventato: i risultati vinti/persi sono reali,
// solo la forza dell'avversario storico non è nota e viene trattata come
// media. Non calcola un Elo per superficie: non abbiamo ancora la superficie
// reale di ogni partita del palinsesto (servirebbe leggere anche la pagina
// del torneo), quindi fingere una colonna "cemento" per tutti sarebbe stato
// fuorviante piuttosto che utile.

export class PlayerStats {
  constructor(name) {
    this.name = name;
    this.elo = 1500;
    this.h2h = {}; // { nomeAvversario: { vittorie, sconfitte } }
  }

  // partita: { avversario, risultato (1 vinta / 0 persa), eloAvversario }
  aggiornaElo(partita, K = 20) {
    const eloAvversario = partita.eloAvversario ?? 1500;
    const atteso = 1 / (1 + Math.pow(10, (eloAvversario - this.elo) / 400));
    this.elo = this.elo + K * (partita.risultato - atteso);
    if (partita.avversario) {
      if (!this.h2h[partita.avversario]) this.h2h[partita.avversario] = { vittorie: 0, sconfitte: 0 };
      if (partita.risultato === 1) this.h2h[partita.avversario].vittorie++;
      else this.h2h[partita.avversario].sconfitte++;
    }
  }
}

// Ricostruisce l'Elo di un giocatore rigiocando in ordine cronologico
// (dalla più vecchia) lo storico recente letto dal profilo.
export function eloDaStorico(recent, name) {
  const ps = new PlayerStats(name);
  if (!recent || !recent.length) return ps;
  [...recent].reverse().forEach(m => ps.aggiornaElo({ avversario: m.opponent, risultato: m.won ? 1 : 0 }));
  return ps;
}

/**
 * Probabilità che il giocatore A batta B, data la loro differenza di Elo,
 * con un correttivo opzionale sui precedenti diretti (tipicamente tra -0.05
 * e +0.05).
 */
export function calcolaProbabilitaVittoria(eloA, eloB, h2hBonus = 0) {
  const base = 1 / (1 + Math.pow(10, (eloB - eloA) / 400));
  return Math.max(0, Math.min(1, base + h2hBonus));
}

// Bonus/malus sui precedenti diretti tra A e B, dallo storico recente di A
// (positivo se A ha vinto più scontri diretti di quanti ne abbia persi).
export function bonusH2H(recentA, nomeB) {
  if (!recentA || !nomeB) return 0;
  const scontri = recentA.filter(m => m.opponent === nomeB);
  if (!scontri.length) return 0;
  const vittorie = scontri.filter(m => m.won).length;
  return Math.max(-0.05, Math.min(0.05, (vittorie - (scontri.length - vittorie)) * 0.02));
}

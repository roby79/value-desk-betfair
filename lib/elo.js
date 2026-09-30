// Elo incrementale per giocatore, ricostruito ogni volta dalle ultime
// partite lette dal profilo (lib/source.js:profileStats). Non è un Elo
// storico persistente su tutta la carriera: parte sempre da 1500 e rigioca
// solo le partite recenti disponibili (fino a 10).
//
// Per ogni partita passata, se conosciamo la quota che aveva allora il
// nostro giocatore (letta dallo storico del profilo), usiamo la probabilità
// implicita di quella quota come "aspettativa" dell'aggiornamento Elo,
// invece di assumere un avversario medio a 1500. Questo è il cambiamento
// più importante rispetto alla versione precedente: il mercato di allora
// sapeva già quanto fosse forte l'avversario (infortuni, forma, tutto ciò
// che noi non modelliamo esplicitamente), e quel dato è reale, non
// inventato. Quando la quota storica non è disponibile, si torna al
// fallback "avversario a 1500".

export class PlayerStats {
  constructor(name) {
    this.name = name;
    this.elo = 1500;
    this.h2h = {}; // { nomeAvversario: { vittorie, sconfitte } }
    this.partiteUsate = 0; // quante partite hanno davvero contribuito (per l'incertezza)
  }

  // partita: { avversario, risultato (1 vinta / 0 persa), eloAvversario?, probMercato? }
  // Se probMercato è presente (quota storica nota) ha priorità su eloAvversario.
  aggiornaElo(partita, K = 20) {
    const atteso = partita.probMercato != null
      ? partita.probMercato
      : 1 / (1 + Math.pow(10, ((partita.eloAvversario ?? 1500) - this.elo) / 400));
    this.elo = this.elo + K * (partita.risultato - atteso);
    this.partiteUsate++;
    if (partita.avversario) {
      if (!this.h2h[partita.avversario]) this.h2h[partita.avversario] = { vittorie: 0, sconfitte: 0 };
      if (partita.risultato === 1) this.h2h[partita.avversario].vittorie++;
      else this.h2h[partita.avversario].sconfitte++;
    }
  }
}

// Ricostruisce l'Elo di un giocatore rigiocando in ordine cronologico
// (dalla più vecchia) lo storico recente letto dal profilo. `recent[i]` può
// avere `ownOdds` (la quota del nostro giocatore in quella partita, se letta
// dal profilo) - se presente e valida, guida l'aggiornamento come descritto
// sopra.
export function eloDaStorico(recent, name) {
  const ps = new PlayerStats(name);
  if (!recent || !recent.length) return ps;
  [...recent].reverse().forEach(m => {
    const probMercato = (m.ownOdds && m.ownOdds > 1.01) ? 1 / m.ownOdds : null;
    ps.aggiornaElo({ avversario: m.opponent, risultato: m.won ? 1 : 0, probMercato });
  });
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

// --- Incertezza in stile Glicko -------------------------------------------
// Non è il vero algoritmo Glicko (che è iterativo e aggiorna l'incertezza di
// entrambi i giocatori insieme): è una versione semplificata che cattura la
// stessa idea - pochi dati osservati => alta incertezza => la stima deve
// restare vicina al 50%; molti dati => l'incertezza scende => la stima può
// discostarsi di più. RD parte da 350 (giocatore senza storico) e scende
// con il numero di partite usate, senza mai andare sotto 50.
export function ratingDeviation(nPartite) {
  const RD0 = 350, RDmin = 50, c = 1.5;
  return Math.max(RDmin, RD0 / Math.sqrt(1 + (nPartite || 0) / c));
}

// Restringe una probabilità verso 0.5 in proporzione all'incertezza (RD).
// RD=350 (nessun dato) -> restituisce esattamente 0.5.
// RD=50 (molti dati) -> restituisce la probabilità quasi intatta.
export function shrinkByConfidence(prob, nPartite) {
  const rd = ratingDeviation(nPartite);
  const confidence = Math.max(0, Math.min(1, 1 - (rd - 50) / 300));
  return 0.5 + (prob - 0.5) * confidence;
}

// --- Combinazione di più stime in log-odds ---------------------------------
// Media pesata nello spazio dei log-odds (logit) invece che nello spazio
// delle probabilità: è il modo statisticamente corretto di sommare fonti di
// evidenza indipendenti (lo stesso principio dell'aggiornamento bayesiano,
// dove le probabilità si combinano moltiplicando i likelihood, cioè
// sommando i log-odds). Attenzione: NON è una scelta "più prudente" della
// media lineare - se le componenti concordano, il risultato può essere più
// deciso, non meno. La prudenza sui dati scarsi arriva da shrinkByConfidence
// (sopra), non da questa funzione: vanno usate insieme.
// `parti` è una lista di [peso, prob] con prob in (0,1); le componenti nulle
// vengono ignorate. Ritorna null se non resta nessuna componente.
export function combinaLogOdds(parti) {
  const valide = parti.filter(([, v]) => v != null);
  if (!valide.length) return null;
  const clamp = p => Math.max(0.02, Math.min(0.98, p));
  const logit = p => Math.log(p / (1 - p));
  const sigmoid = x => 1 / (1 + Math.exp(-x));
  const pesoTotale = valide.reduce((s, [w]) => s + w, 0);
  const mediaLogit = valide.reduce((s, [w, v]) => s + w * logit(clamp(v)), 0) / pesoTotale;
  return { prob: sigmoid(mediaLogit), componentiUsate: valide.length };
}

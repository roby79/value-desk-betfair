import { parse, type HTMLElement } from "node-html-parser";

export type RecordWL = { wins: number; losses: number };
export type Surface = "clay" | "hard" | "indoors" | "grass";
export type Profile = { rank: number | null; season: RecordWL | null; surfaces: Partial<Record<Surface, RecordWL>>; recent: RecordWL | null };
const YEAR = new Date().getUTCFullYear();
const surfaceIndex: Record<Surface, number> = { clay: 2, hard: 3, indoors: 4, grass: 5 };
const clean = (el: HTMLElement) => el.text.replace(/\s+/g, " ").trim();
const wl = (s: string): RecordWL | null => {
  const match = s.trim().match(/^(\d{1,3})\s*[\/-]\s*(\d{1,3})$/);
  return match ? { wins: +match[1], losses: +match[2] } : null;
};

export function parseProfile(html: string, playerUrl?: string): Profile {
  const root = parse(html);
  const text = clean(root);
  const rankMatch = text.match(/Current\s*\/\s*Highest rank\s*-\s*singles\s*:\s*(\d{1,4})\s*\./i);
  const rank = rankMatch ? +rankMatch[1] : null;
  let season: RecordWL | null = null;
  const surfaces: Partial<Record<Surface, RecordWL>> = {};
  // Locate the singles record table by its headers; other tables on this page are doubles and titles.
  for (const table of root.querySelectorAll("table")) {
    const headers = table.querySelectorAll("tr")[0]?.querySelectorAll("th,td").map(clean) || [];
    if (!headers.includes("Year") || !headers.includes("Summary") || !headers.includes("Clay") || !headers.includes("Hard")) continue;
    const yearRow = table.querySelectorAll("tr").find(row => clean(row.querySelector("th,td") || row) === String(YEAR));
    if (!yearRow) continue;
    const values = yearRow.querySelectorAll("th,td").map(clean);
    season = wl(values[headers.indexOf("Summary")] || "");
    for (const surface of Object.keys(surfaceIndex) as Surface[]) {
      const name = surface === "clay" ? "Clay" : surface === "hard" ? "Hard" : surface === "grass" ? "Grass" : "Indoors";
      const record = wl(values[headers.indexOf(name)] || "");
      if (record) surfaces[surface] = record;
    }
    break;
  }
  const recent = playerUrl ? parseRecent(html, playerUrl) : null;
  return { rank, season, surfaces, recent };
}

// Only completed singles rows with identifiable players and a complete set score.
export function parseRecent(html: string, playerUrl: string): RecordWL | null {
  const path = (u: string) => new URL(u, "https://www.tennisexplorer.com").pathname.toLowerCase();
  const self = path(playerUrl);
  const found: { date: string; won: boolean }[] = [];
  const seen = new Set<string>();
  for (const row of parse(html).querySelectorAll("tr")) {
    if (/retired|walkover|w\.o\./i.test(row.innerHTML)) continue;
    const players = row.querySelectorAll("a[href*='/player/']");
    if (players.length !== 2) continue;
    const index = players.findIndex(p => path(p.getAttribute("href") || "") === self);
    if (index < 0) continue;
    const date = clean(row).match(/^(\d{2})\.(\d{2})\./);
    const result = row.querySelector("a[href*='/match-detail/']");
    if (!date || !result) continue;
    const id = result.getAttribute("href")!;
    if (seen.has(id)) continue;
    const score = parse(result.innerHTML);
    score.querySelectorAll("sup").forEach(el => el.remove());
    const text = clean(score);
    if (!/^\d{1,2}-\d{1,2}(?:\s*,\s*\d{1,2}-\d{1,2}){1,4}$/.test(text)) continue;
    const sets = text.split(",").map(s => s.trim().split("-").map(Number));
    if (sets.some(([a,b]) => !((Math.max(a,b) === 6 && Math.min(a,b) <= 4) || (Math.max(a,b) === 7 && [5,6].includes(Math.min(a,b))) || (Math.max(a,b) >= 10 && Math.abs(a-b) >= 2)))) continue;
    const first = sets.filter(([a,b]) => a > b).length;
    const second = sets.length - first;
    if (Math.max(first,second) < 2 || first === second) continue;
    seen.add(id);
    found.push({ date: date[2] + date[1], won: index === (first > second ? 0 : 1) });
  }
  const recent = found.sort((a,b) => b.date.localeCompare(a.date)).slice(0,10);
  return recent.length ? { wins: recent.filter(r => r.won).length, losses: recent.filter(r => !r.won).length } : null;
}

export function parseSurface(html: string): Surface | null {
  const text = clean(parse(html));
  const match = text.match(/\([^)]{0,100}\b(clay|hard|indoors|grass)\s*,\s*(?:men|women)\)/i)
    || text.match(/(?:Surface|Court)\s*:\s*(Clay|Hard|Indoors|Indoor hard|Grass)\b/i);
  if (!match) return null;
  const value = match[1].toLowerCase();
  return value.startsWith("indoor") ? "indoors" : value as Surface;
}

export function parseHeadToHead(html: string): [number, number] | null {
  const heading = clean(parse(html)).match(/Head-to-head\s*:\s*(\d{1,2})\s*[-–]\s*(\d{1,2})/i);
  return heading ? [+heading[1], +heading[2]] : null;
}

export type Analysis = { status: "candidate" | "insufficient" | "outside"; reason: string; surface: Surface | null; probability?: number; implied?: number; edge?: number; factors?: { rank: [number, number]; season: [RecordWL, RecordWL]; surface: [RecordWL, RecordWL]; recent: [RecordWL, RecordWL] | null; h2h?: [number, number] | null } };
export function evaluate(odds: [number, number], a: Profile, b: Profile, surface: Surface | null, h2h: [number, number] | null = null): Analysis {
  const favorite = odds[0] <= odds[1] ? 0 : 1;
  const favOdd = odds[favorite];
  if (!(favOdd >= 1.5 && favOdd <= 3)) return { status: "outside", reason: "Fuori dal range quota 1,50–3,00", surface };
  if (!surface) return { status: "insufficient", reason: "Superficie del torneo non verificata", surface };
  const x = favorite ? b : a, y = favorite ? a : b;
  const sx = x.surfaces[surface], sy = y.surfaces[surface];
  if (!x.rank || !y.rank || !x.season || !y.season || !sx || !sy) return { status: "insufficient", reason: "Ranking o bilanci stagionali/superficie mancanti", surface };
  const n = (r: RecordWL) => r.wins + r.losses;
  if (n(x.season) < 15 || n(y.season) < 15 || n(sx) < 8 || n(sy) < 8) return { status: "insufficient", reason: "Campione insufficiente (minimo 15 stagionali e 8 sulla superficie per giocatore)", surface };
  // Smoothed win rates and capped ranking contribution. Heuristic, not a calibrated forecast.
  const rate = (r: RecordWL) => (r.wins + 5) / (n(r) + 10);
  const logit = (p: number) => Math.log(p / (1 - p));
  const sigmoid = (v: number) => 1 / (1 + Math.exp(-v));
  const rankSignal = Math.max(-0.7, Math.min(0.7, Math.log(y.rank / x.rank) * 0.25));
  const recentSignal = x.recent && y.recent && n(x.recent) >= 5 && n(y.recent) >= 5 ? 0.15 * (logit(rate(x.recent)) - logit(rate(y.recent))) : 0;
  const statSignal = recentSignal + rankSignal + 0.25 * (logit(rate(x.season)) - logit(rate(y.season))) + 0.35 * (logit(rate(sx)) - logit(rate(sy)));
  const implied = 1 / favOdd;
  const model = sigmoid(statSignal);
  // Include market baseline to avoid treating raw win ratios as an independently calibrated probability.
  const probability = Math.max(0.05, Math.min(0.95, 0.65 * ((1 / favOdd) / (1 / odds[0] + 1 / odds[1])) + 0.35 * model));
  const edge = probability - implied;
  return {
    status: edge >= 0.03 ? "candidate" : "outside",
    reason: edge >= 0.03 ? "Candidato statistico: verificare notizie e quota effettiva" : "Margine statistico sotto il 3%",
    surface, probability: +(probability * 100).toFixed(1), implied: +(implied * 100).toFixed(1), edge: +(edge * 100).toFixed(1),
    factors: { rank: [x.rank, y.rank], season: [x.season, y.season], surface: [sx, sy], recent: x.recent && y.recent ? [x.recent, y.recent] : null, h2h: h2h ? favorite ? [h2h[1], h2h[0]] : h2h : null },
  };
}

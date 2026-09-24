import type { Context, Config } from "@netlify/functions";
import { parse, type HTMLElement } from "node-html-parser";
import { parseProfile, parseSurface, parseHeadToHead, evaluate, type Analysis } from "./analysis.mts";

const SOURCE_URLS = [
  "https://www.tennisexplorer.com/next/",
  "https://noproxy.tennisexplorer.com/next/",
  "https://www.tennisexplorer.com/matches/",
  "https://noproxy.tennisexplorer.com/matches/",
];

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";


const MAX_ANALYZED = 15;
const CONCURRENCY = 5;

interface Match {
  time: string;
  tournament: string;
  p1: string;
  p2: string;
  p1Url: string | null;
  p2Url: string | null;
  tournamentUrl?: string | null;
  detailUrl?: string | null;
  analysis?: Analysis;
  odds: [number, number] | null;
  estProb?: number;
  estEdge?: number;
  occasione?: boolean;
  statsNote?: string;
}


function decimalOdd(text: string): number | null {
  const n = parseFloat(text.replace(",", "."));
  if (isNaN(n) || n < 1.01 || n > 500) return null;
  return n;
}

function cleanText(el: HTMLElement): string {
  return el.text.replace(/[\u00A0\s]+/g, " ").trim();
}

async function fetchHtml(url: string, timeoutMs = 8000): Promise<string> {
  let res: Response;
  try { res = await fetch(url, {
    headers: {
      "User-Agent": UA,
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "en-US,en;q=0.9,it;q=0.8",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(timeoutMs),
  }); } catch (e) {
    const cause = e instanceof Error ? (e as Error & { cause?: { code?: string } }).cause : undefined;
    throw new Error(cause?.code || (e instanceof Error ? e.name : "fetch-error"));
  }
  if (!res.ok) throw new Error("http-" + res.status);
  return await res.text();
}

export function parseSchedule(html: string, requestedDay?: string): Match[] {
  const root = parse(html, { lowerCaseTagName: true });
  const matches: Match[] = [];
  let currentTournament = "?";
  let currentTournamentUrl: string | null = null;
  let currentTime = "";

  function numsInRow(row: HTMLElement): number[] {
    const nums: number[] = [];
    for (const c of row.querySelectorAll("td")) {
      const t = cleanText(c);
      const m = t.match(/^(\d{1,3}[.,]\d{1,2})$/);
      if (m) {
        const v = decimalOdd(m[1]);
        if (v != null) nums.push(v);
      }
    }
    return nums;
  }

  const tableDays = new Map<HTMLElement, string>();
  let observedDay = requestedDay;
  for (const element of root.querySelectorAll("h1,h2,h3,div,span,table")) {
    const label = cleanText(element).match(/^(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})$/);
    if (label) observedDay = `${label[3]}-${label[2].padStart(2,"0")}-${label[1].padStart(2,"0")}`;
    if (element.tagName === "TABLE" && observedDay) tableDays.set(element, observedDay);
  }
  const tables = root.querySelectorAll("table");
  for (const table of tables) {
    if (requestedDay && tableDays.get(table) && tableDays.get(table) !== requestedDay) continue;
    const rows = table.querySelectorAll("tr");

    let pending: {
      p1: string; p1Url: string | null; p2?: string; p2Url?: string | null;
      time: string; nums: number[]; detailUrl: string | null; started: boolean;
    } | null = null;

    const finalize = () => {
      if (pending && pending.p2 && !pending.started) {
        const odds: [number, number] | null =
          pending.nums.length >= 2 ? [pending.nums[0], pending.nums[1]] : null;
        matches.push({
          time: pending.time || "?",
          tournament: currentTournament,
          tournamentUrl: currentTournamentUrl,
          detailUrl: pending.detailUrl,
          p1: pending.p1,
          p2: pending.p2,
          p1Url: pending.p1Url,
          p2Url: pending.p2Url || null,
          odds,
        });
      }
      pending = null;
    };

    for (const row of rows) {
      const playerLink = row.querySelector("a[href*='/player/'], a[href*='/doubles-team/']");
      const tourLink = row.querySelector("a[href*='/atp-men/'], a[href*='/wta-women/']");

      if (!playerLink && tourLink) {
        finalize();
        currentTournament = cleanText(tourLink);
        currentTournamentUrl = tourLink.getAttribute("href") || null;
        continue;
      }

      if (!playerLink && /\bH2H\b/.test(cleanText(row))) {
        finalize();
        currentTournament = cleanText(row.querySelector("td,th") || row);
        currentTournamentUrl = null;
        continue;
      }
      if (!playerLink) {
        if (pending) pending.nums.push(...numsInRow(row));
        continue;
      }

      const rowText = row.querySelectorAll("td").map(cleanText).join(" ");
      // The sets column immediately follows the player cell. H2H counts are not scores.
      const rowCells = row.querySelectorAll("td");
      const playerCell = rowCells.findIndex(c => c.querySelector("a[href*='/player/'], a[href*='/doubles-team/']"));
      const setsCell = playerCell >= 0 ? rowCells[playerCell + 1] : null;
      const scoreStarted = !!setsCell && /^\d+$/.test(cleanText(setsCell));
      const inactive = /\b(?:cancelled|canceled|postponed|retired|walkover)\b|w\.o\./i.test(rowText);
      const timeMatch = rowText.match(/\b([0-2]\d:[0-5]\d)\b/);
      const playerName = cleanText(playerLink);
      const playerHref = playerLink.getAttribute("href") || null;
      const detailUrl = row.querySelector("a[href*='/match-detail/']")?.getAttribute("href") || null;
      const nums = numsInRow(row);
      if (timeMatch) currentTime = timeMatch[1];

      if (timeMatch && pending) finalize();
      if (!pending) {
        if (!timeMatch) continue;
        pending = { p1: playerName, p1Url: playerHref, time: timeMatch ? timeMatch[1] : currentTime, nums, detailUrl, started: scoreStarted || inactive };
      } else if (!pending.p2) {
        pending.started ||= scoreStarted || inactive;
        pending.p2 = playerName;
        pending.p2Url = playerHref;
        pending.nums.push(...nums);
        pending.detailUrl ||= detailUrl;
      } else {
        finalize();
        pending = { p1: playerName, p1Url: playerHref, time: timeMatch ? timeMatch[1] : currentTime, nums, detailUrl, started: scoreStarted || inactive };
      }
    }
    finalize();
  }

  const seen = new Set<string>();
  return matches.filter((m) => {
    const key = m.time + "|" + m.p1 + "|" + m.p2;
    if (seen.has(key)) return false;
    seen.add(key);
    if (/\/doubles-team\//.test((m.p1Url || "") + (m.p2Url || ""))) return false;
    return true;
  });
}

function safeSourceUrl(path: string, sourceOrigin: string): string {
  const url = new URL(path, sourceOrigin);
  if (!["www.tennisexplorer.com", "noproxy.tennisexplorer.com", "tennisexplorer.com"].includes(url.hostname)) throw new Error("invalid-source-url");
  url.hostname = new URL(sourceOrigin).hostname;
  url.protocol = "https:";
  return url.toString();
}

export async function analyzeCandidates(matches: Match[], sourceOrigin: string) {
  const candidates = matches.filter(m => m.odds && m.p1Url && m.p2Url && Math.min(...m.odds) >= 1.5 && Math.min(...m.odds) <= 3)
    .sort((a, b) => a.time.localeCompare(b.time)).slice(0, MAX_ANALYZED);
  const surfaceCache = new Map<string, Promise<ReturnType<typeof parseSurface>>>();
  let i = 0;
  async function worker() {
    while (i < candidates.length) {
      const m = candidates[i++];
      try {
        if (!m.tournamentUrl) throw new Error("superficie non verificabile");
        const tourUrl = safeSourceUrl(m.tournamentUrl, sourceOrigin);
        if (!surfaceCache.has(tourUrl)) surfaceCache.set(tourUrl, fetchHtml(tourUrl, 6000).then(parseSurface).catch(() => null));
        const [surface, h1, h2, detail] = await Promise.all([
          surfaceCache.get(tourUrl)!,
          fetchHtml(safeSourceUrl(m.p1Url!, sourceOrigin), 6000),
          fetchHtml(safeSourceUrl(m.p2Url!, sourceOrigin), 6000),
          m.detailUrl ? fetchHtml(safeSourceUrl(m.detailUrl, sourceOrigin), 6000).catch(() => null) : Promise.resolve(null),
        ]);
        m.analysis = evaluate(m.odds!, parseProfile(h1, m.p1Url!), parseProfile(h2, m.p2Url!), surface, detail ? parseHeadToHead(detail) : null);
        m.occasione = m.analysis.status === "candidate";
        m.estProb = m.analysis.probability;
        m.estEdge = m.analysis.edge;
        m.statsNote = m.analysis.reason;
      } catch {
        m.analysis = { status: "insufficient", reason: "Fonte statistica temporaneamente non leggibile", surface: null };
        m.occasione = false;
        m.statsNote = m.analysis.reason;
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  for (const m of matches) if (!m.analysis) {
    m.analysis = { status: "outside", reason: m.odds ? "Fuori range o non analizzata: limite 15 candidati per aggiornamento" : "Quote assenti", surface: null };
    m.occasione = false;
  }
}

// Tennis Explorer labels its schedule GMT+1. Request an explicit calendar date.
export function sourceClock(now = new Date()) {
  const shifted = new Date(now.getTime() + 3600000);
  return { day: shifted.toISOString().slice(0, 10), time: shifted.toISOString().slice(11, 16) };
}
export function italianDay(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
export function upcoming(matches: Match[], now = new Date(), day = sourceClock(now).day) {
  const clock = sourceClock(now);
  return matches.filter(m => /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(m.time))
    .map(m => ({ ...m, startsAt: `${day}T${m.time}:00+01:00` }))
    .filter(m => Date.parse(m.startsAt) > now.getTime() && italianDay(new Date(m.startsAt)) === italianDay(now));
}

export default async (req: Request, context: Context) => {
  const now = new Date();
  const day = italianDay(now);
  const sourceDays = [...new Set([sourceClock(now).day, day])];
  const errors: string[] = [];
  for (const base of SOURCE_URLS) {
    try {
      const batches = await Promise.all(sourceDays.map(async requestedDay => {
        const url = new URL(base);
        const [year, month, date] = requestedDay.split("-");
        url.search = new URLSearchParams({ year, month, day: date, type: "all" }).toString();
        const html = await fetchHtml(url.toString(), 5000);
        const parsed = parseSchedule(html, requestedDay);
        const recognized = parsed.length || /no matches|no match scheduled/i.test(html) || (/H2H/.test(html) && /href=["'][^"']*\/player\//.test(html));
        if (!recognized) throw new Error("tabella del palinsesto non riconosciuta");
        return upcoming(parsed, now, requestedDay);
      }));
      const matches = batches.flat().map(m => ({ ...m, occasione: false,
        analysis: { status: "insufficient", surface: null, reason: "Statistiche in caricamento" } }));
      return Response.json({ version: "scraping-v3", updated: now.toISOString(), day, timezone: "GMT+1", matches, source: base },
        { headers: { "Cache-Control": "no-store" } });
    } catch (e) {
      errors.push(new URL(base).hostname + ": " + (e instanceof Error ? e.message : "errore"));
    }
  }
  return Response.json({ version: "scraping-v3", updated: now.toISOString(), matches: [], error: errors.join("; ") },
    { headers: { "Cache-Control": "no-store" } });
};

export const config: Config = { path: "/api/schedule" };

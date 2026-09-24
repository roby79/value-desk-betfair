import type { Config } from '@netlify/functions';
import { analyzeCandidates } from './schedule.mts';

export default async (req: Request) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  try {
    const raw = await req.text();
    if (raw.length > 5000) return new Response('Richiesta troppo grande', { status: 413 });
    const { match, source } = JSON.parse(raw);
    const origin = new URL(source).origin;
    if (!['https://www.tennisexplorer.com', 'https://noproxy.tennisexplorer.com'].includes(origin)) throw new Error('source');
    if (!match || !Array.isArray(match.odds) || match.odds.length !== 2 || !match.odds.every((n: number) => Number.isFinite(n) && n > 1 && n <= 500)) throw new Error('odds');
    const clean = { time: String(match.time || ''), tournament: '', p1: '', p2: '', odds: match.odds,
      p1Url: String(match.p1Url || ''), p2Url: String(match.p2Url || ''),
      tournamentUrl: String(match.tournamentUrl || ''), detailUrl: String(match.detailUrl || '') };
    await analyzeCandidates([clean], origin);
    return Response.json(clean, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ error: 'Analisi non disponibile' }, { status: 400 });
  }
};
export const config: Config = { path: '/api/match' };

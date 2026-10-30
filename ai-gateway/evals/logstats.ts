// Gateway health from its own log lines (src/log.ts): quota-exhausted rate, schema failures, P95 latency.
//   wrangler tail --format json | node evals/logstats.ts          (live)
//   node evals/logstats.ts saved-logs.jsonl                        (a saved file)
// No cost figure: the app has no AI spend, every call is on the user's own free key.
import fs from 'node:fs';

export interface Row { route: string; prompt: string; ok: boolean; code?: string; quota?: boolean; ms: number }

export const p95 = (xs: number[]) => { if (!xs.length) return 0; const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.ceil(0.95 * s.length) - 1)]; };

export function parseLines(text: string): Row[] {
  const out: Row[] = [];
  for (const line of text.split('\n')) {
    const i = line.indexOf('{'); if (i < 0) continue;
    try { const j = JSON.parse(line.slice(i)); if (typeof j.route === 'string' && typeof j.ms === 'number') out.push(j); } catch { /* not a gateway log line */ }
  }
  return out;
}

export function summarize(rows: Row[]) {
  const by = new Map<string, Row[]>();
  for (const r of rows) (by.get(r.route) || by.set(r.route, []).get(r.route)!).push(r);
  const pct = (n: number, d: number) => (d ? Math.round((1000 * n) / d) / 10 : 0);
  return [...by.entries()].map(([route, rs]) => ({
    route, calls: rs.length,
    quotaPct: pct(rs.filter(r => r.quota).length, rs.length),
    schemaFailPct: pct(rs.filter(r => r.code === 'invalid_output').length, rs.length),
    upstreamFailPct: pct(rs.filter(r => r.code === 'upstream' || r.code === 'model_unavailable').length, rs.length),
    p95ms: p95(rs.map(r => r.ms)),
  }));
}

if (process.argv[1]?.endsWith('logstats.ts')) {
  const text = process.argv[2] ? fs.readFileSync(process.argv[2], 'utf8') : fs.readFileSync(0, 'utf8');
  console.table(summarize(parseLines(text)));
}

// Pure metric functions for the evals (spec section 10.3). Unit-tested without any network.

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
const hit = (found: string, want: string) => { const a = norm(found), b = norm(want); return !!a && !!b && (a.includes(b) || b.includes(a)); };

/** Share of expected names that the model found (recall) and of found names that were expected (precision). */
export function recallPrecision(found: string[], expected: string[]) {
  const rec = expected.length ? expected.filter(e => found.some(f => hit(f, e))).length / expected.length : 1;
  const prec = found.length ? found.filter(f => expected.some(e => hit(f, e))).length / found.length : 1;
  return { recall: rec, precision: prec };
}

export const median = (xs: number[]) => { if (!xs.length) return NaN; const s = [...xs].sort((a, b) => a - b), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

/** |estimate - truth| / truth, as a fraction. When a range [lo, hi] is given, anything inside it is a 0 error. */
export function gramsError(est: number, truth: number | [number, number]) {
  if (Array.isArray(truth)) { const [lo, hi] = truth; if (est >= lo && est <= hi) return 0; return Math.abs(est - (est < lo ? lo : hi)) / ((lo + hi) / 2); }
  return truth > 0 ? Math.abs(est - truth) / truth : 0;
}

/** Numbers that appear in `text` but nowhere in the input JSON (an explainer must not invent numbers). */
export function inventedNumbers(text: string, input: unknown): string[] {
  const allowed = new Set((JSON.stringify(input).match(/\d+(?:\.\d+)?/g) || []).map(Number));
  const words: Record<string, number> = { half: 0.5, one: 1, two: 2, three: 3 };
  [...allowed].forEach(n => { if (n > 0 && n <= 1) { allowed.add(Math.round(n * 100)); } });       // 0.5 may be said "half" or "50%"
  const found = (text.match(/\d+(?:[.,]\d+)?/g) || []).map(s => Number(s.replace(/,/g, '')));
  return found.filter(n => !allowed.has(n) && !(n in words)).map(String);
}

const SHAMING = /\b(bad|junk|cheat|cheating|guilty|ruin|ruined|sin|naughty|disgusting)\b/i;
const OPPOSITE: Record<string, RegExp> = {
  skip: /\b(go ahead|enjoy it|perfectly fine to have|have the full)\b/i,
  go: /\b(skip it|don'?t eat|avoid this|not worth)\b/i,
  swap: /\b(have it as is|go ahead and eat the full)\b/i,
  smaller: /\b(skip it|have the full)\b/i,
};

/** Checks the explainer rules: kind not contradicted, no new numbers, <= 60 words, no shaming words. */
export function checkExplanation(kind: string, text: string, input: unknown) {
  const problems: string[] = [];
  const words = text.trim().split(/\s+/).length;
  if (words > 60) problems.push(`too long (${words} words)`);
  if (SHAMING.test(text)) problems.push('shaming word');
  if (OPPOSITE[kind]?.test(text)) problems.push('contradicts the verdict');
  const extra = inventedNumbers(text, input);
  if (extra.length) problems.push('invented numbers: ' + extra.join(', '));
  return problems;
}

/** A coach reply may only quote numbers from its packet (or small counting words / 14416 / 1% / 18.5). */
export function coachNumbersOk(reply: string, packet: unknown) {
  const allowed = new Set((JSON.stringify(packet).match(/\d+(?:\.\d+)?/g) || []).map(Number));
  for (const n of [14416, 18.5, 1, 2, 3, 24, 7]) allowed.add(n);
  return (reply.match(/\d[\d,]*(?:\.\d+)?/g) || []).map(s => Number(s.replace(/,/g, ''))).filter(n => !allowed.has(n));
}

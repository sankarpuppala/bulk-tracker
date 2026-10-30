export interface CallLog { route: string; prompt: string; model: string; tokensIn: number; tokensOut: number; ms: number; quota: boolean; ok: boolean; code?: string; uid?: string }

/**
 * One JSON line per call. By construction there is no field that can hold user text,
 * image bytes or a Gemini key: callers pass only this typed record.
 */
export function logCall(l: CallLog, out: (s: string) => void = console.log) {
  out(JSON.stringify({ t: new Date().toISOString(), route: l.route, prompt: l.prompt, model: l.model, in: l.tokensIn, out: l.tokensOut, ms: l.ms, quota: l.quota, ok: l.ok, code: l.code, u: l.uid }));
}

// One wrapper around Gemini's generateContent REST endpoint, run on the CALLER's own key.
//
// We use plain fetch rather than the @google/genai SDK: a Worker only needs one endpoint, it keeps
// the bundle tiny, and the request shape below is the documented REST one. The structured-output
// field name has moved between "responseSchema" and "responseJsonSchema" across API versions, so
// it is a single constant: change SCHEMA_FIELD if Google's live docs say otherwise.
import { validate, type Schema } from './schema.ts';
import { fail, type Result } from './types.ts';

export const SCHEMA_FIELD = 'responseSchema';
const BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

export interface Part { text?: string; inlineData?: { mimeType: string; data: string } }
export interface CallInput { system: string; schema: Schema; parts: Part[]; apiKey: string; model: string; temperature?: number }
type Fetch = typeof fetch;

/** Map an upstream HTTP status (and Google's error status string) to our typed errors. */
export function mapUpstream(status: number, body: string) {
  if (status === 429 || /RESOURCE_EXHAUSTED/.test(body)) return fail('quota');
  if (status === 400 && /API key not valid|API_KEY_INVALID/i.test(body)) return fail('bad_key');
  if (status === 401 || status === 403) return fail('bad_key');
  if (status === 404 || /not found|no longer available|deprecated/i.test(body) && status >= 400 && status < 500) return fail('model_unavailable');
  return fail('upstream');
}

async function once(input: CallInput, f: Fetch, extra?: string): Promise<Result<{ json: unknown; raw: string }>> {
  const body = {
    systemInstruction: { parts: [{ text: input.system }] },
    contents: [{ role: 'user', parts: extra ? [...input.parts, { text: extra }] : input.parts }],
    generationConfig: { responseMimeType: 'application/json', [SCHEMA_FIELD]: input.schema, temperature: input.temperature ?? 0.2 },
  };
  let res: Response;
  try {
    res = await f(`${BASE}/${encodeURIComponent(input.model)}:generateContent`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': input.apiKey }, body: JSON.stringify(body) });
  } catch { return fail('upstream'); }
  const text = await res.text();
  if (!res.ok) return mapUpstream(res.status, text);
  let j: any;
  try { j = JSON.parse(text); } catch { return fail('upstream'); }
  const out = j?.candidates?.[0]?.content?.parts?.map((p: Part) => p.text || '').join('') || '';
  const usage = { in: j?.usageMetadata?.promptTokenCount || 0, out: j?.usageMetadata?.candidatesTokenCount || 0 };
  if (!out) return fail('invalid_output');
  try { return { ok: true, data: { json: JSON.parse(out), raw: out }, usage }; } catch { return fail('invalid_output'); }
}

/**
 * Structured call: validates the JSON against the schema and retries once on a parse or
 * validation failure. Returns { ok, data } | { ok: false, code, message }.
 */
export async function callStructured<T = unknown>(input: CallInput, f: Fetch = fetch): Promise<Result<T>> {
  let usage = { in: 0, out: 0 };
  for (let attempt = 0; attempt < 2; attempt++) {
    const r = await once(input, f, attempt ? 'Your previous reply was not valid for the required schema. Reply again with only valid JSON.' : undefined);
    if (!r.ok) { if (r.code === 'invalid_output' && attempt === 0) continue; return r; }
    usage = { in: usage.in + (r.usage?.in || 0), out: usage.out + (r.usage?.out || 0) };
    const errs = validate(input.schema, r.data.json);
    if (!errs.length) return { ok: true, data: r.data.json as T, usage };
  }
  return fail('invalid_output');
}

/** Streaming chat turn: yields text chunks and propose_change function calls as they arrive. */
export async function* streamChat(input: { system: string; contents: unknown[]; tools?: unknown[]; apiKey: string; model: string }, f: Fetch = fetch): AsyncGenerator<{ text?: string; call?: { name: string; args: unknown }; error?: ReturnType<typeof fail> }> {
  let res: Response;
  try {
    res = await f(`${BASE}/${encodeURIComponent(input.model)}:streamGenerateContent?alt=sse`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': input.apiKey },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: input.system }] }, contents: input.contents, tools: input.tools, generationConfig: { temperature: 0.5 } }),
    });
  } catch { yield { error: fail('upstream') }; return; }
  if (!res.ok || !res.body) { yield { error: mapUpstream(res.status, await res.text().catch(() => '')) }; return; }
  const reader = res.body.getReader(), dec = new TextDecoder();
  let buf = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i: number;
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const ev = buf.slice(0, i); buf = buf.slice(i + 2);
      const line = ev.split('\n').find(l => l.startsWith('data:'));
      if (!line) continue;
      try {
        for (const p of JSON.parse(line.slice(5)).candidates?.[0]?.content?.parts || []) {
          if (p.text) yield { text: p.text };
          if (p.functionCall) yield { call: { name: p.functionCall.name, args: p.functionCall.args } };
        }
      } catch { /* ignore a malformed chunk */ }
    }
  }
}

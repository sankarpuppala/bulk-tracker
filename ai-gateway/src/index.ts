// AI Gateway: a thin, authenticated relay between the PWA and Gemini, run on each user's own free key.
//
//   PUT/GET/DELETE /ai/key          save / see (masked) / remove the caller's Gemini key
//   POST /ai/ping                   smoke test
//   POST /ai/vision/{meal,label,menu}
//   POST /ai/parse/ask
//   POST /ai/explain/{verdict,checkin}
//   POST /ai/coach                  streamed (SSE)
//
// There is no app-level Gemini key. Every call: verify the Firebase ID token -> decrypt the caller's
// key -> pace against their free quota -> call Gemini -> validate the JSON -> log counts only.
import { bearer, verifyFirebaseToken } from './auth.ts';
import { decryptKey, encryptKey, maskKey, uidHash } from './crypto.ts';
import { callStructured, streamChat } from './gemini.ts';
import { logCall, type CallLog } from './log.ts';
import { pace } from './pacing.ts';
import { PROMPTS, COACH, type RouteName } from './prompts/index.ts';
import { fail, STATUS, type Env, type ErrCode, type Fail } from './types.ts';
import type { Part } from './gemini.ts';
import type { JWTVerifyGetKey } from 'jose';

export interface Deps { fetch?: typeof fetch; keys?: JWTVerifyGetKey; now?: () => number; log?: (l: string) => void }

const MAX_IMAGE_B64 = Math.ceil(1.5 * 1024 * 1024 * 4 / 3);
const MAX_BODY = MAX_IMAGE_B64 + 40_000;
const KEY_SHAPE = /^[A-Za-z0-9_\-]{20,80}$/;

const clean = (s: unknown, max = 600) => String(s ?? '').replace(/[<>]/g, '‹').slice(0, max);
const json = (body: unknown, status: number, cors: Record<string, string>) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...cors } });
const err = (code: ErrCode, cors: Record<string, string>) => json(fail(code), STATUS[code], cors);

function corsFor(req: Request, env: Env): Record<string, string> {
  const origin = req.headers.get('Origin') || '';
  const ok = env.ALLOWED_ORIGINS.split(',').map(s => s.trim()).filter(Boolean).includes(origin);
  return ok ? { 'Access-Control-Allow-Origin': origin, 'Vary': 'Origin', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS' } : { 'Vary': 'Origin' };
}

/** What each route sends to Gemini: image part first, then the tagged text part. */
function buildParts(route: string, b: any): Part[] | ErrCode {
  const img = (): Part[] | ErrCode => {
    if (typeof b.image !== 'string' || !b.image) return 'bad_request';
    if (b.image.length > MAX_IMAGE_B64) return 'too_large';
    return [{ inlineData: { mimeType: 'image/jpeg', data: b.image.replace(/^data:image\/\w+;base64,/, '') } }];
  };
  switch (route) {
    case 'vision.meal': {
      const p = img(); if (typeof p === 'string') return p;
      const c = b.context || {};
      const cands = (Array.isArray(c.menuCandidates) ? c.menuCandidates : []).slice(0, 30).map((x: unknown) => clean(x, 80));
      return [...p, { text: `<context>\nmeal: ${clean(c.meal, 20)}\ndiet: ${clean(c.diet, 20)}\n<menu_candidates>\n${cands.join('\n')}\n</menu_candidates>\n</context>\nIdentify the items and portions on this plate.` }];
    }
    case 'vision.label': { const p = img(); return typeof p === 'string' ? p : [...p, { text: 'Transcribe this label.' }]; }
    case 'vision.menu': { const p = img(); return typeof p === 'string' ? p : [...p, { text: `<mess>${clean(b.mess, 30)}</mess> Transcribe this menu chart.` }]; }
    case 'parse.ask': return b.text ? [{ text: `<message>${clean(b.text, 400)}</message>` }] : 'bad_request';
    case 'explain.verdict': return b.verdict ? [{ text: `<verdict>${clean(JSON.stringify(b.verdict), 2500)}</verdict>` }] : 'bad_request';
    case 'explain.checkin': return b.checkin ? [{ text: `<checkin>${clean(JSON.stringify(b.checkin), 2500)}</checkin>` }] : 'bad_request';
    case 'ping': return [{ text: 'ping' }];
  }
  return 'not_found';
}

const ROUTES: Record<string, RouteName> = {
  '/ai/ping': 'ping', '/ai/vision/meal': 'vision.meal', '/ai/vision/label': 'vision.label', '/ai/vision/menu': 'vision.menu',
  '/ai/parse/ask': 'parse.ask', '/ai/explain/verdict': 'explain.verdict', '/ai/explain/checkin': 'explain.checkin',
};

export async function handle(req: Request, env: Env, deps: Deps = {}): Promise<Response> {
  const cors = corsFor(req, env), url = new URL(req.url), f = deps.fetch || fetch, now = deps.now?.() ?? Date.now();
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (!url.pathname.startsWith('/ai/')) return err('not_found', cors);

  // 1. who is calling
  const uid = await verifyFirebaseToken(bearer(req), env.FIREBASE_PROJECT_ID, deps.keys);
  if (!uid) return err('unauthorized', cors);
  const kvKey = `gk:${uid}`;

  // 2. manage the caller's own Gemini key
  if (url.pathname === '/ai/key') {
    if (req.method === 'GET') {
      const stored = await env.KEYS.get(kvKey);
      const plain = stored ? await decryptKey(env.KEY_ENCRYPTION_SECRET, uid, stored) : null;
      return json({ ok: true, hasKey: !!plain, masked: plain ? maskKey(plain) : null }, 200, cors);
    }
    if (req.method === 'DELETE') { await env.KEYS.delete(kvKey); return json({ ok: true, hasKey: false }, 200, cors); }
    if (req.method === 'PUT') {
      const b: any = await req.json().catch(() => ({}));
      const key = String(b.key || '').trim();
      if (!KEY_SHAPE.test(key)) return err('bad_key', cors);
      await env.KEYS.put(kvKey, await encryptKey(env.KEY_ENCRYPTION_SECRET, uid, key));
      return json({ ok: true, hasKey: true, masked: maskKey(key) }, 200, cors);      // the key is never echoed in full
    }
    return err('not_found', cors);
  }
  if (req.method !== 'POST') return err('not_found', cors);

  const isCoach = url.pathname === '/ai/coach';
  const route = ROUTES[url.pathname];
  if (!route && !isCoach) return err('not_found', cors);

  // 3. size, body
  const len = +(req.headers.get('content-length') || 0);
  if (len > MAX_BODY) return err('too_large', cors);
  const text = await req.text();
  if (text.length > MAX_BODY) return err('too_large', cors);
  let body: any;
  try { body = JSON.parse(text || '{}'); } catch { return err('bad_request', cors); }

  // 4. the caller's own key: a distinct error when there is none
  const stored = await env.KEYS.get(kvKey);
  const apiKey = stored ? await decryptKey(env.KEY_ENCRYPTION_SECRET, uid, stored) : null;
  if (!apiKey) return err('no_key', cors);

  // 5. pacing against their own free quota
  const verdict = await pace(env.KEYS, uid, now, +(env.PACE_RPM || 8), +(env.PACE_RPD || 200));
  if (verdict !== 'ok') return err(verdict === 'quota' ? 'quota' : 'paced', cors);

  const model = env.GEMINI_MODEL || 'gemini-2.5-flash', u = await uidHash(uid), t0 = now;
  const done = (l: Partial<CallLog> & { prompt: string; ok: boolean }) =>
    logCall({ route: url.pathname, model, tokensIn: 0, tokensOut: 0, ms: (deps.now?.() ?? Date.now()) - t0, quota: false, uid: u, ...l }, deps.log);

  // 6a. coach: streamed
  if (isCoach) {
    if (!body.message) return err('bad_request', cors);
    const history = (Array.isArray(body.history) ? body.history : []).slice(-8).map((m: any) => ({ role: m.role === 'model' ? 'model' : 'user', parts: [{ text: clean(m.text, 800) }] }));
    const contents = [...history, { role: 'user', parts: [{ text: `<context>${clean(JSON.stringify(body.context || {}), 2200)}</context>\n<message>${clean(body.message, 600)}</message>` }] }];
    const gen = streamChat({ system: COACH.system, contents, tools: COACH.tools, apiKey, model }, f);
    const enc = new TextEncoder();
    const stream = new ReadableStream({
      async start(ctrl) {
        let failed: Fail | undefined;
        for await (const ev of gen) {
          if (ev.error) { failed = ev.error; ctrl.enqueue(enc.encode(`data: ${JSON.stringify({ error: ev.error })}\n\n`)); break; }
          ctrl.enqueue(enc.encode(`data: ${JSON.stringify(ev)}\n\n`));
        }
        ctrl.enqueue(enc.encode('data: {"done":true}\n\n'));
        ctrl.close();
        done({ prompt: `${COACH.id}@${COACH.version}`, ok: !failed, code: failed?.code, quota: failed?.code === 'quota' });
      },
    });
    return new Response(stream, { headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-store', ...cors } });
  }

  // 6b. structured routes
  const p = PROMPTS[route];
  const parts = buildParts(p.id, body);
  if (typeof parts === 'string') return err(parts, cors);
  const r = await callStructured({ system: p.system, schema: p.schema, parts, apiKey, model }, f);
  done({ prompt: `${p.id}@${p.version}`, ok: r.ok, code: r.ok ? undefined : r.code, quota: !r.ok && r.code === 'quota', tokensIn: r.ok ? r.usage?.in || 0 : 0, tokensOut: r.ok ? r.usage?.out || 0 : 0 });
  if (!r.ok) return err(r.code, cors);
  return json({ ok: true, data: r.data, prompt: `${p.id}@${p.version}` }, 200, cors);
}

export default { fetch: (req: Request, env: Env) => handle(req, env) };

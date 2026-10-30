// =============================================================
// AI CLIENT — talks to the AI gateway (ai-gateway/), which relays to
// Gemini on the user's OWN free key. Nothing here is required: with
// no gateway, no key, or no network, every non-AI feature still works.
//
//   aiCall('vision/meal', payload)  → { ok, data } | { ok: false, error }
//   aiStream('coach', payload, on)  → streams { text } / { call } events
//   resizeImage(file)               → base64 JPEG ≤ 1024 px (EXIF stripped by the re-encode)
//   keyStatus / saveKey / removeKey → the user's own key, kept encrypted on the gateway
// =============================================================
import { ctx } from './ctx.js';
import { store } from './store.js';
import { lsGet } from './util.js';
import { fitWithin, MAX_EDGE, JPEG_QUALITY, makeCooldown, interpret, friendly } from './engine/aicore.js';

/** Set after deploying ai-gateway/ (README). A device can also override it: localStorage['ff.aiurl']. */
export const AI_GATEWAY_URL = '';
const base = () => String(lsGet('ff.aiurl', '') || AI_GATEWAY_URL).replace(/\/+$/, '');
const cooldown = makeCooldown();

export const aiConfigured = () => !!base();
/** Can this user make AI calls right now (before asking the network)? */
export function aiReady() {
  if (!aiConfigured()) return friendly('unconfigured');
  if (store.mode !== 'cloud' || !ctx.auth?.currentUser) return friendly('signin');
  if (!store.profile.consents?.ai) return { ...friendly('no_key'), consent: true };
  return null;
}

async function token() {
  try { return await ctx.auth?.currentUser?.getIdToken(); } catch { return null; }
}

async function request(path, { method = 'POST', body, manage = false } = {}) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return interpret(0, null, { offline: true });
  const gate = aiReady();
  if (gate && !(manage && gate.consent)) return { ok: false, error: gate.consent ? { ...friendly('no_key'), title: 'Allow AI first', text: 'Turn on “AI features” in You › AI, and add your free key.' } : gate };   // managing your own key doesn't need AI consent yet
  const tok = await token();
  if (!tok) return { ok: false, error: friendly('signin') };
  try {
    const res = await fetch(base() + path, {
      method, headers: { Authorization: 'Bearer ' + tok, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json().catch(() => null);
    return { res, json, ...interpret(res.status, json) };
  } catch { return interpret(0, null); }
}

/** One AI call. `route` like 'vision/meal', 'parse/ask', 'explain/verdict'. */
export async function aiCall(route, payload) {
  if (!cooldown.ready(route)) return { ok: false, error: friendly('cooldown') };
  cooldown.mark(route);
  const r = await request('/ai/' + route, { body: payload });
  return r.ok ? { ok: true, data: r.data, prompt: r.prompt } : { ok: false, error: r.error };
}

/** Streamed coach turn. `on` gets { text } | { call } | { error } and finally { done: true }. */
export async function aiStream(route, payload, on) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) { on({ error: friendly('offline') }); on({ done: true }); return; }
  const gate = aiReady();
  if (gate) { on({ error: gate }); on({ done: true }); return; }
  const tok = await token();
  if (!tok) { on({ error: friendly('signin') }); on({ done: true }); return; }
  try {
    const res = await fetch(base() + '/ai/' + route, { method: 'POST', headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (!res.ok || !res.body) { const j = await res.json().catch(() => null); on({ error: interpret(res.status, j).error }); on({ done: true }); return; }
    const reader = res.body.getReader(), dec = new TextDecoder();
    let buf = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf('\n\n')) >= 0) {
        const line = buf.slice(0, i).split('\n').find(l => l.startsWith('data:')); buf = buf.slice(i + 2);
        if (!line) continue;
        try { const ev = JSON.parse(line.slice(5)); if (ev.error) ev.error = friendly(ev.error.code); on(ev); } catch { /* skip a bad chunk */ }
      }
    }
  } catch { on({ error: friendly('network') }); on({ done: true }); }
}

// ---------- images ----------
/** Resize to ≤ 1024 px on the long edge and re-encode as JPEG 0.8 (which also strips EXIF). Returns base64 without the data: prefix. */
export async function resizeImage(file, max = MAX_EDGE) {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => null);
  if (!bmp) throw new Error('unreadable image');
  const { w, h } = fitWithin(bmp.width, bmp.height, max);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  c.getContext('2d').drawImage(bmp, 0, 0, w, h);
  bmp.close?.();
  const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', JPEG_QUALITY));
  const buf = new Uint8Array(await blob.arrayBuffer());
  let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return { base64: btoa(s), bytes: buf.length, w, h, preview: URL.createObjectURL(blob) };
}

// ---------- the user's own key ----------
export async function keyStatus() {
  const r = await request('/ai/key', { method: 'GET' , manage: true });
  return r.json?.ok ? { ok: true, hasKey: !!r.json.hasKey, masked: r.json.masked } : { ok: false, error: r.error || friendly('upstream') };
}
export async function saveKey(key) {
  const r = await request('/ai/key', { method: 'PUT', body: { key: String(key).trim() } , manage: true });
  return r.json?.ok ? { ok: true, masked: r.json.masked } : { ok: false, error: r.error || friendly('bad_key') };
}
export async function removeKey() {
  const r = await request('/ai/key', { method: 'DELETE' , manage: true });
  return r.json?.ok ? { ok: true } : { ok: false, error: r.error || friendly('upstream') };
}

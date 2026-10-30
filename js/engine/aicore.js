// =============================================================
// AI CORE — the pure parts of the AI client (no DOM, no network):
// image sizing, friendly error states, cooldowns, key shape.
// js/ai.js wires these to fetch, canvas and Firebase.
// =============================================================

export const MAX_EDGE = 1024;           // px, long edge sent to the gateway
export const JPEG_QUALITY = 0.8;
export const COOLDOWN_MS = 4000;        // between calls on one route, so a double tap can't burn free quota

/** Fit (w, h) inside `max` on the long edge; never upscales. */
export function fitWithin(w, h, max = MAX_EDGE) {
  const k = Math.min(1, max / Math.max(w, h, 1));
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) };
}

/** A Google AI Studio key looks like AIza + ~35 url-safe characters. */
export const looksLikeKey = k => /^AIza[A-Za-z0-9_-]{20,70}$/.test(String(k || '').trim());

export const maskKey = k => (String(k).length > 8 ? k.slice(0, 4) + '••••' + k.slice(-4) : '••••');

/**
 * Every failure the UI can meet, as { title, text, action }.
 * action: 'add-key' | 'sign-in' | 'retry' | 'search' | null, so the sheet knows which button to show.
 */
const STATES = {
  offline: { title: 'You’re offline', text: 'Photos and AI answers need a connection. Search and the “should I eat this?” check still work.', action: 'search' },
  unconfigured: { title: 'AI isn’t switched on here', text: 'This copy of the app isn’t connected to an AI gateway yet. Everything else works.', action: 'search' },
  signin: { title: 'Sign in to use AI', text: 'AI features use your account to keep your key safe. Everything else works as a guest.', action: 'sign-in' },
  unauthorized: { title: 'Please sign in again', text: 'Your session expired.', action: 'sign-in' },
  no_key: { title: 'Add a free Google AI key', text: 'Snap and the coach run on your own free key, so they never cost anyone anything. It takes about 30 seconds.', action: 'add-key' },
  bad_key: { title: 'Google didn’t accept that key', text: 'Check it, or make a new one.', action: 'add-key' },
  quota: { title: 'Today’s free quota is used up', text: 'Your free AI quota resets tomorrow. You can keep logging by search.', action: 'search' },
  paced: { title: 'One moment', text: 'Give it a few seconds and try again.', action: 'retry' },
  cooldown: { title: 'One moment', text: 'Give it a few seconds and try again.', action: 'retry' },
  too_large: { title: 'That photo is too big', text: 'Try again; we’ll shrink it more.', action: 'retry' },
  bad_request: { title: 'That didn’t work', text: 'Try again.', action: 'retry' },
  model_unavailable: { title: 'AI is temporarily unavailable', text: 'Search still works.', action: 'search' },
  upstream: { title: 'AI is temporarily unavailable', text: 'Search still works.', action: 'search' },
  invalid_output: { title: 'Couldn’t read that', text: 'Try again, or search instead.', action: 'retry' },
  network: { title: 'Couldn’t reach the AI', text: 'Check your connection and try again.', action: 'retry' },
};
export const friendly = code => ({ code, ...(STATES[code] || STATES.upstream) });

/** Per-route cooldown. `now` injected for tests. */
export function makeCooldown(ms = COOLDOWN_MS) {
  const last = new Map();
  return {
    ready(route, now = Date.now()) { return !last.has(route) || now - last.get(route) >= ms; },
    mark(route, now = Date.now()) { last.set(route, now); },
    reset() { last.clear(); },
  };
}

/** Turn a gateway/network outcome into { ok, data } | { ok: false, error: friendly(...) }. */
export function interpret(status, body, { offline = false } = {}) {
  if (offline) return { ok: false, error: friendly('offline') };
  if (status === 0) return { ok: false, error: friendly('network') };
  if (status >= 200 && status < 300 && body?.ok) return { ok: true, data: body.data, prompt: body.prompt };
  const code = body?.code || (status === 401 ? 'unauthorized' : status === 413 ? 'too_large' : status === 429 ? 'quota' : 'upstream');
  return { ok: false, error: friendly(code) };
}

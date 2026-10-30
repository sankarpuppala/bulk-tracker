export interface KV { get(key: string): Promise<string | null>; put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void>; delete(key: string): Promise<void> }

export interface Env {
  KEYS: KV;
  FIREBASE_PROJECT_ID: string;
  ALLOWED_ORIGINS: string;
  GEMINI_MODEL?: string;
  PACE_RPM?: string;
  PACE_RPD?: string;
  KEY_ENCRYPTION_SECRET: string;
}

export type ErrCode = 'unauthorized' | 'no_key' | 'bad_key' | 'quota' | 'paced' | 'too_large' | 'bad_request' | 'model_unavailable' | 'upstream' | 'invalid_output' | 'not_found';
export const STATUS: Record<ErrCode, number> = {
  unauthorized: 401, no_key: 403, bad_key: 403, quota: 429, paced: 429, too_large: 413, bad_request: 400, model_unavailable: 503, upstream: 502, invalid_output: 502, not_found: 404,
};
export const MESSAGE: Record<ErrCode, string> = {
  unauthorized: 'Please sign in again.',
  no_key: 'Add your free Google AI key to use this.',
  bad_key: 'Google rejected your AI key. Check it or add a new one.',
  quota: 'Today’s free AI quota is used up. Try again tomorrow; everything else keeps working.',
  paced: 'Give it a few seconds and try again.',
  too_large: 'That photo is too large. Try again.',
  bad_request: 'That request was not understood.',
  model_unavailable: 'AI is temporarily unavailable. Search still works.',
  upstream: 'AI is temporarily unavailable. Search still works.',
  invalid_output: 'The AI gave an unusable answer. Try again.',
  not_found: 'Not found.',
};

export type Fail = { ok: false; code: ErrCode; message: string };
export type Result<T> = { ok: true; data: T; usage?: { in: number; out: number } } | Fail;
export const fail = (code: ErrCode): Fail => ({ ok: false, code, message: MESSAGE[code] });

import type { KV } from './types.ts';

/**
 * Per-user pacing that mirrors Gemini's free tier for THEIR OWN key (not an app spend cap:
 * the app is never billed). Fixed windows in KV; KV is eventually consistent, which is fine
 * for protecting a user from burning their own quota with a double tap.
 */
export async function pace(kv: KV, uid: string, now: number, rpm: number, rpd: number): Promise<'ok' | 'paced' | 'quota'> {
  const minute = `pace:m:${uid}:${Math.floor(now / 60000)}`, day = `pace:d:${uid}:${new Date(now).toISOString().slice(0, 10)}`;
  const [m, d] = await Promise.all([kv.get(minute), kv.get(day)]);
  if (+(d || 0) >= rpd) return 'quota';
  if (+(m || 0) >= rpm) return 'paced';
  await Promise.all([kv.put(minute, String(+(m || 0) + 1), { expirationTtl: 120 }), kv.put(day, String(+(d || 0) + 1), { expirationTtl: 90000 })]);
  return 'ok';
}

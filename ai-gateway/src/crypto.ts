// AES-GCM encryption for stored Gemini keys. The key material is derived from the
// KEY_ENCRYPTION_SECRET Worker secret; the uid is bound in as additional data so a
// ciphertext cannot be replayed under another user.
const enc = new TextEncoder(), dec = new TextDecoder();
const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
const unb64 = (s: string) => Uint8Array.from(atob(s), c => c.charCodeAt(0));

async function aesKey(secret: string): Promise<CryptoKey> {
  const raw = await crypto.subtle.digest('SHA-256', enc.encode(secret));
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function encryptKey(secret: string, uid: string, plain: string): Promise<string> {
  if (!secret) throw new Error('KEY_ENCRYPTION_SECRET is not set');
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: enc.encode(uid) }, await aesKey(secret), enc.encode(plain)));
  return b64(iv) + '.' + b64(ct);
}

export async function decryptKey(secret: string, uid: string, stored: string): Promise<string | null> {
  try {
    const [iv, ct] = stored.split('.');
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv), additionalData: enc.encode(uid) }, await aesKey(secret), unb64(ct));
    return dec.decode(pt);
  } catch { return null; }
}

export const maskKey = (k: string) => (k.length > 8 ? k.slice(0, 4) + '••••' + k.slice(-4) : '••••');

/** Short stable hash for logs: lets us count users without recording who they are. */
export async function uidHash(uid: string): Promise<string> {
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode('uid:' + uid)));
  return [...h.slice(0, 5)].map(x => x.toString(16).padStart(2, '0')).join('');
}

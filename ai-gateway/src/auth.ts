import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';

// Firebase ID tokens are signed with Google's securetoken keys, published as a JWKS.
const JWKS_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
let jwks: JWTVerifyGetKey | null = null;

/** Returns the uid for a valid token, or null. `keys` is injectable for tests. */
export async function verifyFirebaseToken(token: string, projectId: string, keys?: JWTVerifyGetKey): Promise<string | null> {
  if (!token || !projectId) return null;
  try {
    jwks ||= createRemoteJWKSet(new URL(JWKS_URL));
    const { payload } = await jwtVerify(token, keys || jwks, { issuer: `https://securetoken.google.com/${projectId}`, audience: projectId, algorithms: ['RS256'] });
    return typeof payload.sub === 'string' && payload.sub ? payload.sub : null;
  } catch { return null; }
}

export const bearer = (req: Request) => (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');

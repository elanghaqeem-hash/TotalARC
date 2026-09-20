import type { UserRole } from '@/lib/access-control';

export const AUTH_COOKIE_NAME = 'total_arc_session';
export const AUTH_SESSION_SECONDS = 8 * 60 * 60;

export type SessionPayload = {
  v: 1;
  sub: string;
  email: string;
  name: string;
  role: UserRole;
  institutionId: string | null;
  orgUnitId: string | null;
  department: string | null;
  iat: number;
  exp: number;
  jti: string;
};

function base64UrlEncodeBytes(bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlEncodeString(value: string) {
  return base64UrlEncodeBytes(new TextEncoder().encode(value));
}

function base64UrlDecodeString(value: string) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

async function importHmacKey(secret: string) {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

export function isAuthSecretUsable(secret: unknown): secret is string {
  return typeof secret === 'string' && secret.length >= 32;
}

export async function signSessionToken(payload: SessionPayload, secret: string) {
  if (!isAuthSecretUsable(secret)) throw new Error('AUTH_SECRET_INVALID');

  const encodedPayload = base64UrlEncodeString(JSON.stringify(payload));
  const key = await importHmacKey(secret);
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(encodedPayload)
  );

  return encodedPayload + '.' + base64UrlEncodeBytes(new Uint8Array(signature));
}

export async function verifySessionToken(token: string, secret: string): Promise<SessionPayload | null> {
  if (!token || !isAuthSecretUsable(secret)) return null;

  const [encodedPayload, encodedSignature, extra] = token.split('.');
  if (!encodedPayload || !encodedSignature || extra) return null;

  try {
    const normalized = encodedSignature.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    const signatureBinary = atob(padded);
    const signature = Uint8Array.from(signatureBinary, char => char.charCodeAt(0));

    const key = await importHmacKey(secret);
    const valid = await crypto.subtle.verify(
      'HMAC',
      key,
      signature,
      new TextEncoder().encode(encodedPayload)
    );
    if (!valid) return null;

    const payload = JSON.parse(base64UrlDecodeString(encodedPayload)) as SessionPayload;
    if (
      payload.v !== 1 ||
      !payload.sub ||
      !payload.email ||
      !payload.role ||
      !payload.exp ||
      payload.exp <= Math.floor(Date.now() / 1000)
    ) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

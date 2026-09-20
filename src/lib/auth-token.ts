import { getRuntimeSecret } from '@/lib/cloudflare-db';
import type { PermissionKey } from '@/lib/security-model';

export const AUTH_COOKIE_NAME = 'totalarc_session';

export type SessionInstitution = {
  id: string;
  name: string;
  legalName?: string | null;
  databaseBinding: string;
  folderKey: string;
};

export type SessionPayload = {
  sub: string;
  sid: string;
  username: string;
  displayName: string;
  employeeId?: string | null;
  email?: string | null;
  jobTitle?: string | null;
  institution: SessionInstitution;
  institutions: SessionInstitution[];
  roles: string[];
  permissions: PermissionKey[];
  unitIds: string[];
  mustChangePassword: boolean;
  iat: number;
  exp: number;
};

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function stringToBase64Url(value: string) {
  return bytesToBase64Url(new TextEncoder().encode(value));
}

function base64UrlToBytes(value: string) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

function base64UrlToString(value: string) {
  return new TextDecoder().decode(base64UrlToBytes(value));
}

async function hmac(secret: string, value: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value));
  return bytesToBase64Url(new Uint8Array(signature));
}

export async function signSessionToken(payload: SessionPayload) {
  const secret = await getRuntimeSecret('AUTH_SESSION_SECRET');
  const header = stringToBase64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = stringToBase64Url(JSON.stringify(payload));
  const signature = await hmac(secret, header + '.' + body);
  return header + '.' + body + '.' + signature;
}

export async function verifySessionToken(token: string, secretOverride?: string): Promise<SessionPayload | null> {
  try {
    const [header, body, signature, extra] = token.split('.');
    if (!header || !body || !signature || extra) return null;
    const secret = secretOverride || (await getRuntimeSecret('AUTH_SESSION_SECRET'));
    const expected = await hmac(secret, header + '.' + body);
    if (expected.length !== signature.length) return null;

    let diff = 0;
    for (let i = 0; i < expected.length; i += 1) {
      diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
    }
    if (diff !== 0) return null;

    const parsed = JSON.parse(base64UrlToString(body)) as SessionPayload;
    const now = Math.floor(Date.now() / 1000);
    if (!parsed?.sub || !parsed?.sid || !parsed?.institution?.id || !parsed.exp || parsed.exp <= now) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function decodeSessionTokenUnsafe(token: string): SessionPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    return JSON.parse(base64UrlToString(parts[1])) as SessionPayload;
  } catch {
    return null;
  }
}

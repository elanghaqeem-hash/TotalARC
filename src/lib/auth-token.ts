export const AUTH_COOKIE_NAME = 'totalarc_session';

export const AUTH_ROLES = [
  'SuperAdmin',
  'InstitutionAdmin',
  'RiskManager',
  'ProcessOwner',
  'ControlOwner',
  'Tester',
  'Reviewer',
  'Executive',
  'InternalAudit',
  'Compliance',
  'CyberGRC',
  'BCM',
  'ThirdPartyRisk',
  'RegulatoryCompliance'
] as const;

export type AuthRole = (typeof AUTH_ROLES)[number];

export const ROLE_TITLES: Record<AuthRole, string> = {
  SuperAdmin: 'Platform Super Administrator',
  InstitutionAdmin: 'Institution Administrator',
  RiskManager: 'Enterprise Risk Manager',
  ProcessOwner: 'Process Owner',
  ControlOwner: 'Control Owner',
  Tester: 'Independent Tester',
  Reviewer: 'Independent Reviewer',
  Executive: 'Executive / Management',
  InternalAudit: 'Internal Audit',
  Compliance: 'Compliance',
  CyberGRC: 'Cyber GRC',
  BCM: 'Business Continuity Management',
  ThirdPartyRisk: 'Third-Party Risk',
  RegulatoryCompliance: 'Regulatory Compliance'
};

export type AuthSessionClaims = {
  sid: string;
  uid: string;
  institutionId: string;
  role: AuthRole;
  primaryOrgUnitId: string | null;
  mustChangePassword: boolean;
  iat: number;
  exp: number;
};

function utf8(value: string) {
  return new TextEncoder().encode(value);
}

function base64UrlFromBytes(bytes: Uint8Array) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x4000) {
    const chunk = bytes.subarray(i, Math.min(bytes.length, i + 0x4000));
    for (let j = 0; j < chunk.length; j += 1) binary += String.fromCharCode(chunk[j]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function bytesFromBase64Url(value: string) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (value.length % 4 || 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function stringFromBase64Url(value: string) {
  return new TextDecoder().decode(bytesFromBase64Url(value));
}

async function hmacKey(secret: string) {
  return crypto.subtle.importKey(
    'raw',
    utf8(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

export function getAuthRuntimeConfig() {
  const enforce = String(process.env.AUTH_ENFORCE || 'false').toLowerCase() === 'true';
  const secret = String(process.env.AUTH_SESSION_SECRET || '');
  const bootstrapSecret = String(process.env.AUTH_BOOTSTRAP_TOKEN || '');
  const ttlRaw = Number(process.env.AUTH_SESSION_TTL_MINUTES || 60);
  const ttlMinutes = Number.isFinite(ttlRaw) ? Math.max(15, Math.min(480, Math.trunc(ttlRaw))) : 60;

  return {
    enforce,
    secret,
    bootstrapSecret,
    secretReady: secret.length >= 32,
    bootstrapReady: bootstrapSecret.length >= 16,
    ttlMinutes
  };
}

export async function signSessionToken(claims: AuthSessionClaims, secret: string) {
  if (secret.length < 32) throw new Error('AUTH_SECRET_NOT_CONFIGURED');
  const payload = base64UrlFromBytes(utf8(JSON.stringify(claims)));
  const key = await hmacKey(secret);
  const signature = await crypto.subtle.sign('HMAC', key, utf8(payload));
  return payload + '.' + base64UrlFromBytes(new Uint8Array(signature));
}

export async function verifySessionToken(token: string, secret: string): Promise<AuthSessionClaims | null> {
  if (!token || secret.length < 32) return null;
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return null;

  try {
    const key = await hmacKey(secret);
    const valid = await crypto.subtle.verify(
      'HMAC',
      key,
      bytesFromBase64Url(signature),
      utf8(payload)
    );
    if (!valid) return null;

    const parsed = JSON.parse(stringFromBase64Url(payload)) as Partial<AuthSessionClaims>;
    if (
      typeof parsed.sid !== 'string' ||
      typeof parsed.uid !== 'string' ||
      typeof parsed.institutionId !== 'string' ||
      !AUTH_ROLES.includes(parsed.role as AuthRole) ||
      typeof parsed.iat !== 'number' ||
      typeof parsed.exp !== 'number'
    ) {
      return null;
    }

    const now = Math.floor(Date.now() / 1000);
    if (parsed.exp <= now || parsed.iat > now + 60) return null;

    return {
      sid: parsed.sid,
      uid: parsed.uid,
      institutionId: parsed.institutionId,
      role: parsed.role as AuthRole,
      primaryOrgUnitId:
        typeof parsed.primaryOrgUnitId === 'string' && parsed.primaryOrgUnitId
          ? parsed.primaryOrgUnitId
          : null,
      mustChangePassword: parsed.mustChangePassword === true,
      iat: parsed.iat,
      exp: parsed.exp
    };
  } catch {
    return null;
  }
}

const ADMIN_ROLES = new Set<AuthRole>(['SuperAdmin', 'InstitutionAdmin']);
const ASSURANCE_ROLES = new Set<AuthRole>([
  'SuperAdmin',
  'InstitutionAdmin',
  'RiskManager',
  'Tester',
  'Reviewer',
  'InternalAudit',
  'Compliance',
  'CyberGRC',
  'RegulatoryCompliance'
]);

const READ_MOST_ROLES = new Set<AuthRole>(AUTH_ROLES);

function writeMethod(method: string) {
  return !['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase());
}

export function canAccessPath(role: AuthRole, pathname: string, method = 'GET') {
  const path = pathname || '/';
  const write = writeMethod(method);

  if (path.startsWith('/admin') || path.startsWith('/api/admin')) {
    return ADMIN_ROLES.has(role);
  }

  if (path === '/onboarding' || path.startsWith('/api/onboarding')) {
    return ADMIN_ROLES.has(role);
  }

  if (path === '/organization' || path.startsWith('/api/organization')) {
    if (write) return ADMIN_ROLES.has(role);
    return READ_MOST_ROLES.has(role);
  }

  if (path === '/profile' || path.startsWith('/api/auth/profile')) return true;

  if (path === '/certification' || path.startsWith('/api/icofr/certification')) {
    if (!write) return true;
    return ['SuperAdmin', 'InstitutionAdmin', 'Reviewer', 'Executive', 'InternalAudit'].includes(role);
  }

  if (
    path.startsWith('/icofr') ||
    path === '/tod' ||
    path === '/toe' ||
    path === '/rcsa' ||
    path === '/remediation' ||
    path === '/evidence' ||
    path.startsWith('/api/icofr') ||
    path.startsWith('/api/assure') ||
    path.startsWith('/api/evidence')
  ) {
    if (!write) return READ_MOST_ROLES.has(role);
    if (role === 'Executive') return false;
    return ASSURANCE_ROLES.has(role) || ['ProcessOwner', 'ControlOwner', 'BCM', 'ThirdPartyRisk'].includes(role);
  }

  if (
    path === '/processes' ||
    path === '/risks' ||
    path === '/controls' ||
    path === '/rcm' ||
    path.startsWith('/api/processes') ||
    path.startsWith('/api/risks') ||
    path.startsWith('/api/controls') ||
    path.startsWith('/api/rcm')
  ) {
    if (!write) return true;
    return !['Executive'].includes(role);
  }

  return true;
}

export function roleCanAdministerUsers(role: string) {
  return role === 'SuperAdmin' || role === 'InstitutionAdmin';
}

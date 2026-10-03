import { getCloudflareContext } from '@opennextjs/cloudflare';
import type { UserRole } from '@/lib/access-control';

type D1DatabaseLike = {
  exec: (sql: string) => Promise<unknown>;
  prepare: (sql: string) => {
    bind: (...values: unknown[]) => {
      first: <T = Record<string, unknown>>() => Promise<T | null>;
      run: () => Promise<unknown>;
      all: <T = Record<string, unknown>>() => Promise<{ results?: T[] }>;
    };
    first: <T = Record<string, unknown>>() => Promise<T | null>;
    run: () => Promise<unknown>;
    all: <T = Record<string, unknown>>() => Promise<{ results?: T[] }>;
  };
};

export type MfaMethod = 'TOTP' | 'PASSKEY' | 'EMAIL_OTP' | 'SSO_MFA';

export const MFA_REQUIRED_ROLES: UserRole[] = [
  'SystemAdmin',
  'Admin',
  'InternalAuditor',
  'ICOFRCoordinator',
  'Reviewer',
  'Executive'
];

export const MFA_POLICY = {
  challengeTtlSeconds: 5 * 60,
  maxAttempts: 6,
  totpStepSeconds: 30,
  totpDigits: 6,
  totpWindow: 1,
  emailOtpTtlSeconds: 5 * 60
} as const;

type RuntimeEnv = Record<string, unknown>;

async function runtimeEnv(): Promise<RuntimeEnv> {
  try {
    const { env } = await getCloudflareContext({ async: true });
    return env as unknown as RuntimeEnv;
  } catch {
    return process.env as unknown as RuntimeEnv;
  }
}

async function db(): Promise<D1DatabaseLike> {
  const env = await runtimeEnv();
  const database = env.DB as D1DatabaseLike | undefined;
  if (!database) throw new Error('AUTH_DATABASE_UNAVAILABLE');
  return database;
}

async function execScript(database: D1DatabaseLike, script: string) {
  for (const statement of script.split(';').map(item => item.trim()).filter(Boolean)) {
    await database.prepare(statement).run();
  }
}

let schemaReady: Promise<D1DatabaseLike> | null = null;

export async function ensureMfaSchema() {
  if (schemaReady) return schemaReady;
  schemaReady = (async () => {
    const database = await db();
    await execScript(database, `
      CREATE TABLE IF NOT EXISTS AuthMfaCredential (
        id TEXT PRIMARY KEY NOT NULL,
        userId TEXT NOT NULL,
        type TEXT NOT NULL,
        label TEXT,
        secretCiphertext TEXT,
        credentialId TEXT,
        publicKeySpki TEXT,
        algorithm INTEGER,
        signCount INTEGER NOT NULL DEFAULT 0,
        active INTEGER NOT NULL DEFAULT 1,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL,
        lastUsedAt TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_auth_mfa_credential_user
        ON AuthMfaCredential(userId,active,type);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_auth_mfa_credential_webauthn
        ON AuthMfaCredential(credentialId)
        WHERE credentialId IS NOT NULL;

      CREATE TABLE IF NOT EXISTS AuthMfaChallenge (
        id TEXT PRIMARY KEY NOT NULL,
        userId TEXT NOT NULL,
        purpose TEXT NOT NULL,
        tokenHash TEXT NOT NULL,
        dataJson TEXT NOT NULL DEFAULT '{}',
        expiresAt TEXT NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        maxAttempts INTEGER NOT NULL DEFAULT 6,
        consumedAt TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_auth_mfa_challenge_user
        ON AuthMfaChallenge(userId,expiresAt,consumedAt);
    `);
    return database;
  })().catch(error => {
    schemaReady = null;
    throw error;
  });
  return schemaReady;
}

function nowIso() {
  return new Date().toISOString();
}

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlToBytes(value: string) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function randomToken(bytes = 32) {
  return bytesToBase64Url(crypto.getRandomValues(new Uint8Array(bytes)));
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return bytesToBase64Url(new Uint8Array(digest));
}

function safeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) {
    diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return diff === 0;
}

async function mfaMasterSecret() {
  const env = await runtimeEnv();
  const secret = String(
    env.AUTH_MFA_MASTER_KEY ||
    env.TOTAL_ARC_AUTH_SECRET ||
    env.AUTH_TOKEN_SECRET ||
    ''
  );
  if (secret.length < 32) throw new Error('AUTH_MFA_SECRET_INVALID');
  return secret;
}

async function encryptionKey() {
  const secret = await mfaMasterSecret();
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode('totalarc/mfa/v1|' + secret)
  );
  return crypto.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

async function encrypt(value: string) {
  const key = await encryptionKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(value)
  );
  return 'v1.' + bytesToBase64Url(iv) + '.' + bytesToBase64Url(new Uint8Array(ciphertext));
}

async function decrypt(value: string) {
  const [version, iv, ciphertext] = value.split('.');
  if (version !== 'v1' || !iv || !ciphertext) throw new Error('AUTH_MFA_SECRET_FORMAT_INVALID');
  const key = await encryptionKey();
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64UrlToBytes(iv) },
    key,
    base64UrlToBytes(ciphertext)
  );
  return new TextDecoder().decode(plaintext);
}

function base32Encode(bytes: Uint8Array) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0;
  let value = 0;
  let output = '';
  for (let index = 0; index < bytes.length; index += 1) {
    value = (value << 8) | bytes[index];
    bits += 8;
    while (bits >= 5) {
      output += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += alphabet[(value << (5 - bits)) & 31];
  return output;
}

function base32Decode(value: string) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const clean = value.toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0;
  let buffer = 0;
  const output: number[] = [];
  for (const char of clean) {
    const index = alphabet.indexOf(char);
    if (index < 0) continue;
    buffer = (buffer << 5) | index;
    bits += 5;
    if (bits >= 8) {
      output.push((buffer >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return new Uint8Array(output);
}

async function totpAt(secret: string, timeMs: number) {
  const counter = Math.floor(timeMs / 1000 / MFA_POLICY.totpStepSeconds);
  const counterBytes = new Uint8Array(8);
  let remaining = counter;
  for (let index = 7; index >= 0; index -= 1) {
    counterBytes[index] = remaining & 255;
    remaining = Math.floor(remaining / 256);
  }

  const secretBytes = base32Decode(secret);
  const key = await crypto.subtle.importKey(
    'raw',
    secretBytes,
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign']
  );
  const signature = new Uint8Array(
    await crypto.subtle.sign('HMAC', key, counterBytes)
  );
  const offset = signature[signature.length - 1] & 15;
  const binary =
    ((signature[offset] & 127) << 24) |
    ((signature[offset + 1] & 255) << 16) |
    ((signature[offset + 2] & 255) << 8) |
    (signature[offset + 3] & 255);
  return String(binary % 10 ** MFA_POLICY.totpDigits).padStart(MFA_POLICY.totpDigits, '0');
}

async function verifyTotpSecret(secret: string, code: string) {
  const clean = code.replace(/\D/g, '');
  if (clean.length !== MFA_POLICY.totpDigits) return false;
  const now = Date.now();
  for (let offset = -MFA_POLICY.totpWindow; offset <= MFA_POLICY.totpWindow; offset += 1) {
    const expected = await totpAt(
      secret,
      now + offset * MFA_POLICY.totpStepSeconds * 1000
    );
    if (safeEqual(expected, clean)) return true;
  }
  return false;
}

export function isMfaRequiredForRole(role: UserRole) {
  return MFA_REQUIRED_ROLES.includes(role);
}

async function listCredentials(userId: string) {
  const database = await ensureMfaSchema();
  const result = await database.prepare(
    `SELECT id,userId,type,label,credentialId,publicKeySpki,algorithm,signCount,active,createdAt,lastUsedAt
       FROM AuthMfaCredential
      WHERE userId=? AND active=1
      ORDER BY createdAt ASC`
  ).bind(userId).all<Record<string, unknown>>();
  return result.results || [];
}

async function methodAvailability() {
  const env = await runtimeEnv();
  return {
    emailOtp: Boolean(env.RESEND_API_KEY && env.AUTH_EMAIL_FROM),
    ssoMfa: Boolean(env.AUTH_SSO_MFA_GATEWAY_SECRET)
  };
}

export async function prepareMfaLogin(input: {
  userId: string;
  email: string;
}) {
  const credentials = await listCredentials(input.userId);
  const availability = await methodAvailability();
  const methods: MfaMethod[] = [];
  if (credentials.some(item => item.type === 'TOTP')) methods.push('TOTP');
  if (credentials.some(item => item.type === 'PASSKEY')) methods.push('PASSKEY');
  if (availability.emailOtp) methods.push('EMAIL_OTP');
  if (availability.ssoMfa) methods.push('SSO_MFA');

  const setupRequired = methods.length === 0;
  const token = randomToken();
  const id = crypto.randomUUID();
  const now = Date.now();
  const expiresAt = new Date(now + MFA_POLICY.challengeTtlSeconds * 1000).toISOString();
  const database = await ensureMfaSchema();

  await database.prepare(
    `INSERT INTO AuthMfaChallenge (
      id,userId,purpose,tokenHash,dataJson,expiresAt,attempts,maxAttempts,consumedAt,createdAt,updatedAt
    ) VALUES (?,?,?,?,'{}',?,0,?,NULL,?,?)`
  ).bind(
    id,
    input.userId,
    setupRequired ? 'ENROLL' : 'LOGIN',
    await sha256(token),
    expiresAt,
    MFA_POLICY.maxAttempts,
    nowIso(),
    nowIso()
  ).run();

  return {
    required: true,
    setupRequired,
    challengeId: id,
    challengeToken: token,
    expiresAt,
    methods: setupRequired ? (['TOTP', 'PASSKEY'] as MfaMethod[]) : methods
  };
}

async function challengeRecord(id: string, token: string) {
  const database = await ensureMfaSchema();
  const row = await database.prepare(
    'SELECT * FROM AuthMfaChallenge WHERE id=? LIMIT 1'
  ).bind(id).first<Record<string, unknown>>();
  if (!row) throw new Error('MFA_CHALLENGE_INVALID');
  if (row.consumedAt) throw new Error('MFA_CHALLENGE_CONSUMED');
  if (new Date(String(row.expiresAt)).getTime() <= Date.now()) {
    throw new Error('MFA_CHALLENGE_EXPIRED');
  }
  if (Number(row.attempts || 0) >= Number(row.maxAttempts || MFA_POLICY.maxAttempts)) {
    throw new Error('MFA_CHALLENGE_ATTEMPTS_EXCEEDED');
  }
  const expected = String(row.tokenHash || '');
  const actual = await sha256(token);
  if (!safeEqual(expected, actual)) throw new Error('MFA_CHALLENGE_INVALID');
  return row;
}

async function challengeData(row: Record<string, unknown>) {
  try {
    const parsed = JSON.parse(String(row.dataJson || '{}'));
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

async function updateChallengeData(id: string, data: Record<string, unknown>) {
  const database = await ensureMfaSchema();
  await database.prepare(
    'UPDATE AuthMfaChallenge SET dataJson=?,updatedAt=? WHERE id=? AND consumedAt IS NULL'
  ).bind(JSON.stringify(data), nowIso(), id).run();
}

async function recordChallengeFailure(id: string) {
  const database = await ensureMfaSchema();
  await database.prepare(
    'UPDATE AuthMfaChallenge SET attempts=attempts+1,updatedAt=? WHERE id=? AND consumedAt IS NULL'
  ).bind(nowIso(), id).run();
}

export async function consumeMfaChallenge(id: string) {
  const database = await ensureMfaSchema();
  await database.prepare(
    'UPDATE AuthMfaChallenge SET consumedAt=?,updatedAt=? WHERE id=? AND consumedAt IS NULL'
  ).bind(nowIso(), nowIso(), id).run();
}

export async function challengeUser(input: { challengeId: string; challengeToken: string }) {
  const row = await challengeRecord(input.challengeId, input.challengeToken);
  return {
    userId: String(row.userId),
    purpose: String(row.purpose)
  };
}

export async function beginTotpEnrollment(input: {
  challengeId: string;
  challengeToken: string;
  accountLabel: string;
}) {
  const row = await challengeRecord(input.challengeId, input.challengeToken);
  if (String(row.purpose) !== 'ENROLL') throw new Error('MFA_ENROLLMENT_NOT_ALLOWED');

  const secret = base32Encode(crypto.getRandomValues(new Uint8Array(20)));
  const data = await challengeData(row);
  data.pendingTotpSecret = await encrypt(secret);
  await updateChallengeData(input.challengeId, data);

  const issuer = 'Total ARC';
  const label = encodeURIComponent(issuer + ':' + input.accountLabel);
  const uri =
    'otpauth://totp/' + label +
    '?secret=' + encodeURIComponent(secret) +
    '&issuer=' + encodeURIComponent(issuer) +
    '&algorithm=SHA1&digits=6&period=30';

  return { secret, otpauthUri: uri, issuer, digits: 6, period: 30 };
}

export async function confirmTotpEnrollment(input: {
  challengeId: string;
  challengeToken: string;
  code: string;
}) {
  const row = await challengeRecord(input.challengeId, input.challengeToken);
  if (String(row.purpose) !== 'ENROLL') throw new Error('MFA_ENROLLMENT_NOT_ALLOWED');
  const data = await challengeData(row);
  const encryptedSecret = String(data.pendingTotpSecret || '');
  if (!encryptedSecret) throw new Error('MFA_TOTP_SETUP_NOT_STARTED');
  const secret = await decrypt(encryptedSecret);
  const valid = await verifyTotpSecret(secret, input.code);
  if (!valid) {
    await recordChallengeFailure(input.challengeId);
    throw new Error('MFA_CODE_INVALID');
  }

  const database = await ensureMfaSchema();
  const userId = String(row.userId);
  await database.prepare(
    'UPDATE AuthMfaCredential SET active=0,updatedAt=? WHERE userId=? AND type=? AND active=1'
  ).bind(nowIso(), userId, 'TOTP').run();
  await database.prepare(
    `INSERT INTO AuthMfaCredential (
      id,userId,type,label,secretCiphertext,credentialId,publicKeySpki,algorithm,signCount,
      active,createdAt,updatedAt,lastUsedAt
    ) VALUES (?,?,?,'Aplikasi Authenticator',?,NULL,NULL,NULL,0,1,?,?,?)`
  ).bind(
    crypto.randomUUID(),
    userId,
    'TOTP',
    await encrypt(secret),
    nowIso(),
    nowIso(),
    nowIso()
  ).run();

  return { userId, method: 'TOTP' as MfaMethod };
}

export async function verifyTotpLogin(input: {
  challengeId: string;
  challengeToken: string;
  code: string;
}) {
  const row = await challengeRecord(input.challengeId, input.challengeToken);
  const userId = String(row.userId);
  const database = await ensureMfaSchema();
  const credential = await database.prepare(
    `SELECT * FROM AuthMfaCredential
      WHERE userId=? AND type='TOTP' AND active=1
      ORDER BY createdAt DESC LIMIT 1`
  ).bind(userId).first<Record<string, unknown>>();
  if (!credential?.secretCiphertext) throw new Error('MFA_METHOD_NOT_ENROLLED');

  const secret = await decrypt(String(credential.secretCiphertext));
  const valid = await verifyTotpSecret(secret, input.code);
  if (!valid) {
    await recordChallengeFailure(input.challengeId);
    throw new Error('MFA_CODE_INVALID');
  }

  await database.prepare(
    'UPDATE AuthMfaCredential SET lastUsedAt=?,updatedAt=? WHERE id=?'
  ).bind(nowIso(), nowIso(), String(credential.id)).run();
  return { userId, method: 'TOTP' as MfaMethod };
}

export async function sendEmailOtp(input: {
  challengeId: string;
  challengeToken: string;
  email: string;
}) {
  const row = await challengeRecord(input.challengeId, input.challengeToken);
  const env = await runtimeEnv();
  const apiKey = String(env.RESEND_API_KEY || '');
  const from = String(env.AUTH_EMAIL_FROM || '');
  if (!apiKey || !from) throw new Error('MFA_EMAIL_NOT_CONFIGURED');

  const random = crypto.getRandomValues(new Uint32Array(1))[0] % 1000000;
  const code = String(random).padStart(6, '0');
  const data = await challengeData(row);
  data.emailOtpHash = await sha256(input.challengeId + '|' + code);
  data.emailOtpExpiresAt = new Date(Date.now() + MFA_POLICY.emailOtpTtlSeconds * 1000).toISOString();
  await updateChallengeData(input.challengeId, data);

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + apiKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from,
      to: [input.email],
      subject: 'Kode verifikasi Total ARC',
      text:
        'Kode verifikasi Total ARC Anda: ' + code +
        '. Kode berlaku 5 menit. Jangan berikan kode ini kepada siapa pun.'
    })
  });
  if (!response.ok) throw new Error('MFA_EMAIL_DELIVERY_FAILED');

  return { sent: true, maskedEmail: maskEmail(input.email) };
}

function maskEmail(email: string) {
  const [local, domain] = email.split('@');
  if (!domain) return '***';
  return (local.slice(0, 2) || '*') + '***@' + domain;
}

export async function verifyEmailOtp(input: {
  challengeId: string;
  challengeToken: string;
  code: string;
}) {
  const row = await challengeRecord(input.challengeId, input.challengeToken);
  const data = await challengeData(row);
  const expiresAt = String(data.emailOtpExpiresAt || '');
  if (!expiresAt || new Date(expiresAt).getTime() <= Date.now()) {
    throw new Error('MFA_CODE_EXPIRED');
  }
  const expected = String(data.emailOtpHash || '');
  const actual = await sha256(input.challengeId + '|' + input.code.replace(/\D/g, ''));
  if (!expected || !safeEqual(expected, actual)) {
    await recordChallengeFailure(input.challengeId);
    throw new Error('MFA_CODE_INVALID');
  }
  return { userId: String(row.userId), method: 'EMAIL_OTP' as MfaMethod };
}

function requestOrigin(request: Request) {
  const configured = process.env.AUTH_WEBAUTHN_ORIGIN || '';
  return configured || new URL(request.url).origin;
}

function requestRpId(request: Request) {
  const configured = process.env.AUTH_WEBAUTHN_RP_ID || '';
  return configured || new URL(request.url).hostname;
}

export async function beginPasskeyEnrollment(input: {
  request: Request;
  challengeId: string;
  challengeToken: string;
  userId: string;
  userName: string;
  displayName: string;
}) {
  const row = await challengeRecord(input.challengeId, input.challengeToken);
  if (String(row.purpose) !== 'ENROLL') throw new Error('MFA_ENROLLMENT_NOT_ALLOWED');
  if (String(row.userId) !== input.userId) throw new Error('MFA_CHALLENGE_INVALID');

  const challenge = randomToken(32);
  const data = await challengeData(row);
  data.webauthnChallenge = challenge;
  data.webauthnOrigin = requestOrigin(input.request);
  data.webauthnRpId = requestRpId(input.request);
  await updateChallengeData(input.challengeId, data);

  return {
    challenge,
    rp: { id: data.webauthnRpId, name: 'Total ARC' },
    user: {
      id: bytesToBase64Url(new TextEncoder().encode(input.userId)),
      name: input.userName,
      displayName: input.displayName
    },
    pubKeyCredParams: [
      { type: 'public-key', alg: -7 },
      { type: 'public-key', alg: -257 }
    ],
    timeout: 60000,
    attestation: 'none',
    authenticatorSelection: {
      residentKey: 'preferred',
      userVerification: 'required'
    }
  };
}

async function validateClientData(
  encoded: string,
  expectedType: 'webauthn.create' | 'webauthn.get',
  expectedChallenge: string,
  expectedOrigin: string
) {
  const json = new TextDecoder().decode(base64UrlToBytes(encoded));
  const data = JSON.parse(json) as Record<string, unknown>;
  if (data.type !== expectedType) throw new Error('MFA_PASSKEY_CLIENT_DATA_INVALID');
  if (data.challenge !== expectedChallenge) throw new Error('MFA_PASSKEY_CHALLENGE_INVALID');
  if (data.origin !== expectedOrigin) throw new Error('MFA_PASSKEY_ORIGIN_INVALID');
  return json;
}

export async function confirmPasskeyEnrollment(input: {
  request: Request;
  challengeId: string;
  challengeToken: string;
  credentialId: string;
  publicKeySpki: string;
  algorithm: number;
  clientDataJSON: string;
}) {
  const row = await challengeRecord(input.challengeId, input.challengeToken);
  if (String(row.purpose) !== 'ENROLL') throw new Error('MFA_ENROLLMENT_NOT_ALLOWED');
  const data = await challengeData(row);
  const challenge = String(data.webauthnChallenge || '');
  const origin = String(data.webauthnOrigin || requestOrigin(input.request));
  if (!challenge) throw new Error('MFA_PASSKEY_SETUP_NOT_STARTED');
  await validateClientData(input.clientDataJSON, 'webauthn.create', challenge, origin);

  if (![-7, -257].includes(Number(input.algorithm))) {
    throw new Error('MFA_PASSKEY_ALGORITHM_UNSUPPORTED');
  }

  const database = await ensureMfaSchema();
  const userId = String(row.userId);
  await database.prepare(
    `INSERT INTO AuthMfaCredential (
      id,userId,type,label,secretCiphertext,credentialId,publicKeySpki,algorithm,signCount,
      active,createdAt,updatedAt,lastUsedAt
    ) VALUES (?,?,?,'Passkey',NULL,?,?,?,0,1,?,?,?)`
  ).bind(
    crypto.randomUUID(),
    userId,
    'PASSKEY',
    input.credentialId,
    input.publicKeySpki,
    Number(input.algorithm),
    nowIso(),
    nowIso(),
    nowIso()
  ).run();

  return { userId, method: 'PASSKEY' as MfaMethod };
}

export async function beginPasskeyAuthentication(input: {
  request: Request;
  challengeId: string;
  challengeToken: string;
}) {
  const row = await challengeRecord(input.challengeId, input.challengeToken);
  const userId = String(row.userId);
  const database = await ensureMfaSchema();
  const result = await database.prepare(
    `SELECT credentialId FROM AuthMfaCredential
      WHERE userId=? AND type='PASSKEY' AND active=1 AND credentialId IS NOT NULL`
  ).bind(userId).all<{ credentialId?: string }>();
  const credentials = (result.results || [])
    .map(item => String(item.credentialId || ''))
    .filter(Boolean);
  if (!credentials.length) throw new Error('MFA_METHOD_NOT_ENROLLED');

  const challenge = randomToken(32);
  const data = await challengeData(row);
  data.webauthnChallenge = challenge;
  data.webauthnOrigin = requestOrigin(input.request);
  data.webauthnRpId = requestRpId(input.request);
  await updateChallengeData(input.challengeId, data);

  return {
    challenge,
    rpId: data.webauthnRpId,
    timeout: 60000,
    userVerification: 'required',
    allowCredentials: credentials.map(id => ({
      type: 'public-key',
      id
    }))
  };
}

function concat(left: Uint8Array, right: Uint8Array) {
  const out = new Uint8Array(left.length + right.length);
  out.set(left, 0);
  out.set(right, left.length);
  return out;
}

function derEcdsaToRaw(signature: Uint8Array) {
  if (signature[0] !== 0x30) throw new Error('MFA_PASSKEY_SIGNATURE_INVALID');
  let offset = 2;
  if (signature[1] & 0x80) {
    offset = 2 + (signature[1] & 0x7f);
  }
  if (signature[offset] !== 0x02) throw new Error('MFA_PASSKEY_SIGNATURE_INVALID');
  const rLen = signature[offset + 1];
  let r = signature.slice(offset + 2, offset + 2 + rLen);
  offset = offset + 2 + rLen;
  if (signature[offset] !== 0x02) throw new Error('MFA_PASSKEY_SIGNATURE_INVALID');
  const sLen = signature[offset + 1];
  let s = signature.slice(offset + 2, offset + 2 + sLen);

  while (r.length > 32 && r[0] === 0) r = r.slice(1);
  while (s.length > 32 && s[0] === 0) s = s.slice(1);
  const raw = new Uint8Array(64);
  raw.set(r, 32 - r.length);
  raw.set(s, 64 - s.length);
  return raw;
}

async function verifyRpIdHash(authenticatorData: Uint8Array, rpId: string) {
  if (authenticatorData.length < 37) return false;
  const digest = new Uint8Array(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(rpId))
  );
  for (let index = 0; index < 32; index += 1) {
    if (digest[index] !== authenticatorData[index]) return false;
  }
  return true;
}

export async function verifyPasskeyAuthentication(input: {
  request: Request;
  challengeId: string;
  challengeToken: string;
  credentialId: string;
  clientDataJSON: string;
  authenticatorData: string;
  signature: string;
}) {
  const row = await challengeRecord(input.challengeId, input.challengeToken);
  const userId = String(row.userId);
  const database = await ensureMfaSchema();
  const credential = await database.prepare(
    `SELECT * FROM AuthMfaCredential
      WHERE userId=? AND type='PASSKEY' AND active=1 AND credentialId=?
      LIMIT 1`
  ).bind(userId, input.credentialId).first<Record<string, unknown>>();
  if (!credential?.publicKeySpki) throw new Error('MFA_METHOD_NOT_ENROLLED');

  const data = await challengeData(row);
  const challenge = String(data.webauthnChallenge || '');
  const origin = String(data.webauthnOrigin || requestOrigin(input.request));
  const rpId = String(data.webauthnRpId || requestRpId(input.request));
  if (!challenge) throw new Error('MFA_PASSKEY_CHALLENGE_INVALID');

  const clientJson = await validateClientData(
    input.clientDataJSON,
    'webauthn.get',
    challenge,
    origin
  );
  const authenticatorData = base64UrlToBytes(input.authenticatorData);
  if (!(await verifyRpIdHash(authenticatorData, rpId))) {
    throw new Error('MFA_PASSKEY_RPID_INVALID');
  }
  const flags = authenticatorData[32];
  if ((flags & 0x01) === 0) throw new Error('MFA_PASSKEY_USER_PRESENCE_REQUIRED');

  const clientHash = new Uint8Array(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(clientJson))
  );
  const signedData = concat(authenticatorData, clientHash);
  const algorithm = Number(credential.algorithm || -7);
  const spki = base64UrlToBytes(String(credential.publicKeySpki));
  let key: CryptoKey;
  let valid = false;

  if (algorithm === -7) {
    key = await crypto.subtle.importKey(
      'spki',
      spki,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify']
    );
    const signature = derEcdsaToRaw(base64UrlToBytes(input.signature));
    valid = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      key,
      signature,
      signedData
    );
  } else if (algorithm === -257) {
    key = await crypto.subtle.importKey(
      'spki',
      spki,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify']
    );
    valid = await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      key,
      base64UrlToBytes(input.signature),
      signedData
    );
  } else {
    throw new Error('MFA_PASSKEY_ALGORITHM_UNSUPPORTED');
  }

  if (!valid) {
    await recordChallengeFailure(input.challengeId);
    throw new Error('MFA_PASSKEY_SIGNATURE_INVALID');
  }

  const signCount =
    (authenticatorData[33] << 24) |
    (authenticatorData[34] << 16) |
    (authenticatorData[35] << 8) |
    authenticatorData[36];
  const previousCount = Number(credential.signCount || 0);
  if (signCount !== 0 && previousCount !== 0 && signCount <= previousCount) {
    throw new Error('MFA_PASSKEY_COUNTER_REPLAY');
  }

  await database.prepare(
    'UPDATE AuthMfaCredential SET signCount=?,lastUsedAt=?,updatedAt=? WHERE id=?'
  ).bind(signCount, nowIso(), nowIso(), String(credential.id)).run();

  return { userId, method: 'PASSKEY' as MfaMethod };
}

export async function verifySsoMfaGateway(input: {
  request: Request;
  challengeId: string;
  challengeToken: string;
  email: string;
}) {
  const row = await challengeRecord(input.challengeId, input.challengeToken);
  const env = await runtimeEnv();
  const secret = String(env.AUTH_SSO_MFA_GATEWAY_SECRET || '');
  if (secret.length < 32) throw new Error('MFA_SSO_NOT_CONFIGURED');

  const assertedEmail = String(input.request.headers.get('x-totalarc-sso-mfa-email') || '').trim().toLowerCase();
  const timestamp = String(input.request.headers.get('x-totalarc-sso-mfa-timestamp') || '');
  const signature = String(input.request.headers.get('x-totalarc-sso-mfa-signature') || '');
  if (!assertedEmail || !timestamp || !signature) throw new Error('MFA_SSO_ASSERTION_MISSING');
  if (assertedEmail !== input.email.trim().toLowerCase()) throw new Error('MFA_SSO_EMAIL_MISMATCH');

  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > 5 * 60 * 1000) {
    throw new Error('MFA_SSO_ASSERTION_EXPIRED');
  }

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const expected = bytesToBase64Url(
    new Uint8Array(
      await crypto.subtle.sign(
        'HMAC',
        key,
        new TextEncoder().encode(assertedEmail + '|' + timestamp)
      )
    )
  );
  if (!safeEqual(expected, signature)) throw new Error('MFA_SSO_SIGNATURE_INVALID');

  return { userId: String(row.userId), method: 'SSO_MFA' as MfaMethod };
}

export async function getMfaCredentialSummary(userId: string) {
  const credentials = await listCredentials(userId);
  const availability = await methodAvailability();
  return {
    required: false,
    credentials: credentials.map(item => ({
      id: String(item.id),
      type: String(item.type),
      label: item.label ? String(item.label) : null,
      createdAt: String(item.createdAt || ''),
      lastUsedAt: item.lastUsedAt ? String(item.lastUsedAt) : null
    })),
    emailOtpAvailable: availability.emailOtp,
    ssoMfaAvailable: availability.ssoMfa
  };
}

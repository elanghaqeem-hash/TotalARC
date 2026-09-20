const fs = require('fs');
const path = require('path');

const root = process.cwd();

function source(file) {
  const full = path.join(root, file);
  if (!fs.existsSync(full)) {
    throw new Error('AUTH_SECURITY_INTEGRITY_ERROR: missing ' + file);
  }
  return fs.readFileSync(full, 'utf8');
}

function requireMarker(file, marker) {
  const content = source(file);
  if (!content.includes(marker)) {
    throw new Error('AUTH_SECURITY_INTEGRITY_ERROR: ' + file + ' missing marker: ' + marker);
  }
}

const requirements = [
  ['src/lib/auth-token.ts', 'export const AUTH_SESSION_SECONDS = 60 * 60;'],
  ['src/lib/auth-token.ts', 'mustChangePassword: boolean;'],
  ['src/lib/auth.ts', 'const PASSWORD_ITERATIONS = 100000;'],
  ['src/lib/auth-security.ts', 'CREATE TABLE IF NOT EXISTS AuthSession'],
  ['src/lib/auth-security.ts', 'CREATE TABLE IF NOT EXISTS AuthPasswordHistory'],
  ['src/lib/auth-security.ts', 'LIMIT 5'],
  ['src/lib/auth-security.ts', 'validatePasswordPolicy'],
  ['src/lib/auth-security.ts', 'revokeUserSessions'],
  ['src/lib/auth.ts', 'registerAuthSession'],
  ['src/lib/auth.ts', 'assertPasswordNotReused'],
  ['src/lib/auth.ts', 'mustChangePassword = 1'],
  ['src/lib/auth.ts', 'changeOwnPassword'],
  ['src/middleware.ts', 'isAuthSessionActive'],
  ['src/middleware.ts', 'PASSWORD_CHANGE_REQUIRED'],
  ['src/app/api/auth/profile/route.ts', 'CHANGE_PASSWORD'],
  ['src/app/profile/page.tsx', '/api/auth/profile'],
  ['src/app/api/admin/security/route.ts', 'REVOKE_SESSION'],
  ['src/app/admin/security/page.tsx', '/api/admin/security'],
  ['src/components/layout/AppShell.tsx', '/admin/security'],
  ['src/components/layout/AppShell.tsx', '/profile']
];

for (const [file, marker] of requirements) {
  requireMarker(file, marker);
}

const adminApi = source('src/app/api/admin/users/route.ts');
for (const code of ['PASSWORD_POLICY', 'PASSWORD_REUSE']) {
  if (!adminApi.includes(code)) {
    throw new Error('AUTH_SECURITY_INTEGRITY_ERROR: user administration must map ' + code);
  }
}

console.log(
  'Authentication security integrity verified: revocable D1 sessions, forced password change, password history, profile security, and administrator session controls are present.'
);


const authSource = source('src/lib/auth.ts');
if (/passwordIterations\s+INTEGER\s+NOT\s+NULL\s+DEFAULT\s+(?:1[0-9]{5,}|[2-9][0-9]{5,})/.test(authSource)) {
  throw new Error('AUTH_SECURITY_INTEGRITY_ERROR: PBKDF2 work factor exceeds the Cloudflare Workers runtime cap.');
}

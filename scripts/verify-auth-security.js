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
  ['src/lib/auth.ts', 'executeSchemaScript'],
  ['src/lib/auth-security.ts', 'executeSchemaScript'],
  ['src/lib/auth-security.ts', 'CREATE TABLE IF NOT EXISTS AuthSession'],
  ['src/lib/auth-security.ts', 'CREATE TABLE IF NOT EXISTS AuthPasswordHistory'],
  ['src/lib/auth-security.ts', 'CREATE TABLE IF NOT EXISTS AuthLoginRateLimit'],
  ['src/lib/auth-security.ts', 'AUTH_LOGIN_RATE_LIMIT'],
  ['src/lib/auth-security.ts', "limit: 5, windowMs: 60 * 1000"],
  ['src/lib/auth-security.ts', "limit: 20, windowMs: 15 * 60 * 1000"],
  ['src/lib/auth-security.ts', "limit: 100, windowMs: 60 * 60 * 1000"],
  ['src/app/api/auth/login/route.ts', 'enforceAuthLoginRateLimit'],
  ['src/app/api/auth/login/route.ts', "code: 'AUTH_LOGIN_RATE_LIMIT'"],
  ['src/app/api/auth/login/route.ts', "'Retry-After'"],
  ['src/lib/auth-security.ts', 'LIMIT 5'],
  ['src/lib/auth-security.ts', 'validatePasswordPolicy'],
  ['src/lib/auth-security.ts', 'revokeUserSessions'],
  ['src/lib/auth-mfa.ts', 'CREATE TABLE IF NOT EXISTS AuthMfaCredential'],
  ['src/lib/auth-mfa.ts', 'CREATE TABLE IF NOT EXISTS AuthMfaChallenge'],
  ['src/lib/auth-mfa.ts', "'SystemAdmin'"],
  ['src/lib/auth-mfa.ts', "'Admin'"],
  ['src/lib/auth-mfa.ts', "'InternalAuditor'"],
  ['src/lib/auth-mfa.ts', "'ICOFRCoordinator'"],
  ['src/lib/auth-mfa.ts', "'Reviewer'"],
  ['src/lib/auth-mfa.ts', "'Executive'"],
  ['src/lib/auth-mfa.ts', 'verifyTotpLogin'],
  ['src/lib/auth-mfa.ts', 'verifyPasskeyAuthentication'],
  ['src/lib/auth-mfa.ts', 'verifyEmailOtp'],
  ['src/lib/auth-mfa.ts', 'verifySsoMfaGateway'],
  ['src/app/api/auth/mfa/route.ts', 'CONFIRM_TOTP_ENROLLMENT'],
  ['src/app/api/auth/mfa/route.ts', 'BEGIN_PASSKEY_AUTHENTICATION'],
  ['src/lib/auth.ts', 'LOGIN_SUCCESS_MFA'],
  ['src/lib/auth-token.ts', 'mfaAt?: number'],
  ['src/middleware.ts', 'isMfaRequiredForRole'],
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
  ['src/components/layout/AppShell.tsx', '/profile'],
  ['src/lib/access-control.ts', "'SystemAdmin'"],
  ['src/lib/access-control.ts', "'RiskManager'"],
  ['src/lib/access-control.ts', "'ComplianceOfficer'"],
  ['src/lib/access-control.ts', "'InternalAuditor'"],
  ['src/lib/access-control.ts', "'ICOFRCoordinator'"],
  ['src/lib/access-control.ts', "'RCSACoordinator'"],
  ['src/lib/access-control.ts', "'EvidenceContributor'"],
  ['src/lib/access-control.ts', "'ReadOnlyAuditor'"],
  ['src/lib/access-control.ts', 'canAdministerTenantUsers'],
  ['src/lib/access-control.ts', 'canAssignRole'],
  ['src/app/api/admin/users/route.ts', 'canAssignRole(admin.role'],
  ['src/app/api/admin/users/route.ts', "admin.role === 'Admin'"],
  ['src/app/api/admin/security/route.ts', 'canAdministerTenantUsers'],
  ['src/app/api/admin/security/route.ts', 'actorRole: admin.role'],
  ['src/lib/auth.ts', 'PRIVILEGED_SESSION_PROTECTED'],
  ['src/lib/auth.ts', '20261004_ADMIN_ROLE_SPLIT'],
  ['src/lib/institution-context.ts', "profile.role === 'SystemAdmin'"],
  ['src/app/api/admin/ai-settings/route.ts', "context.profile.role !== 'SystemAdmin'"]
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
  'Authentication security integrity verified: mandatory MFA, revocable D1 sessions, login rate limiting, forced password change, password history, profile security, and administrator session controls are present.'
);


const authSource = source('src/lib/auth.ts');
const iterationDefaults = [...authSource.matchAll(/passwordIterations\\s+INTEGER\\s+NOT\\s+NULL\\s+DEFAULT\\s+(\\d+)/g)]
  .map(match => Number(match[1]));
if (iterationDefaults.some(value => value > 100000)) {
  throw new Error('AUTH_SECURITY_INTEGRITY_ERROR: PBKDF2 work factor exceeds the Cloudflare Workers runtime cap.');
}


for (const file of ['src/lib/auth.ts', 'src/lib/auth-security.ts']) {
  const content = source(file);
  if (/await\s+db\.exec\s*\(\s*`/.test(content)) {
    throw new Error(
      'AUTH_SECURITY_INTEGRITY_ERROR: ' + file +
      ' must execute multi-statement D1 schema scripts statement-by-statement.'
    );
  }
}

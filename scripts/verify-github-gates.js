const fs = require('fs');

function source(file) {
  if (!fs.existsSync(file)) {
    throw new Error('GITHUB_GATE_CONTRACT_ERROR: missing ' + file);
  }
  return fs.readFileSync(file, 'utf8');
}

function requireMarker(file, marker) {
  if (!source(file).includes(marker)) {
    throw new Error(
      'GITHUB_GATE_CONTRACT_ERROR: ' + file + ' missing mandatory marker: ' + marker
    );
  }
}

const requiredChecks = '.github/workflows/required-checks.yml';
for (const marker of [
  'name: Build',
  'name: TypeScript',
  'name: Test Suite',
  'name: Auth Security',
  'name: Tenant Isolation',
  'name: No Dummy Data',
  'name: D1 Schema Stability',
  'name: RCM Integrity',
  'name: AI Security',
  'name: ICOFR Traceability Integrity',
  'name: Cloudflare Build',
  'name: Merge Gate',
  '- main',
  '- hotfix/**',
  '- build',
  '- typescript',
  '- test-suite',
  '- auth-security',
  '- tenant-isolation',
  '- no-dummy-data',
  '- d1-schema-stability',
  '- rcm-integrity',
  '- ai-security',
  '- icofr-traceability',
  '- cloudflare-build'
]) {
  requireMarker(requiredChecks, marker);
}

const deploy = '.github/workflows/deploy-cloudflare.yml';
for (const marker of [
  'push:',
  '- main',
  'Wait for mandatory checks on main commit',
  'select(.status == "completed" and .conclusion == "success")',
  'SUCCESS_URL',
  'ACTIVE_COUNT',
  'FAILED_COUNT',
  'Require merged PR provenance for production deploy',
  'Production deployment blocked: main commit',
  'Verify immutable CI action refs',
  'Verify authentication security integrity',
  'Verify D1 schema stability',
  'Verify RCM integrity contract',
  'Verify ICOFR traceability integrity contract',
  'Verify AI security and banking redaction',
  'Verify TypeScript',
  'Verify multi-institution isolation',
  'Build OpenNext Worker',
  'Deploy Worker with pinned Cloudflare bindings',
  'Verify production D1 binding identity',
  'Verify production login rate-limit path',
  'Verify AI runtime and provider connectivity'
]) {
  requireMarker(deploy, marker);
}

const smoke = '.github/workflows/verify-production-d1.yml';
for (const marker of [
  'workflow_run:',
  '- Deploy Total ARC to Cloudflare',
  'Verify production D1 connectivity',
  'Smoke test production system integrity and auth boundaries',
  'check_protected "institution" "/api/onboarding"',
  'check_protected "organization" "/api/organization"',
  '/api/system/rcm-integrity',
  '/api/system/icofr-integrity',
  '.mandatoryChainGapCount == 0'
]) {
  requireMarker(smoke, marker);
}

const productionGate = '.github/workflows/production-gate.yml';
for (const marker of [
  'name: Production Gate',
  '- Verify production D1 persistence',
  'Production Gate — Build → Test → Security → Deploy → Smoke',
  'deploy-cloudflare.yml/runs?head_sha=$TARGET_SHA',
  'No successful TotalARC Cloudflare deployment was found',
  'TotalARC Production Evidence'
]) {
  requireMarker(productionGate, marker);
}

const protectionAudit = '.github/workflows/audit-main-protection.yml';
for (const marker of [
  'name: Audit main branch protection',
  'name: Main Protection Audit',
  '/branches/main',
  '.protected // false',
  'Configure a repository ruleset/branch protection and require Merge Gate before merge'
]) {
  requireMarker(protectionAudit, marker);
}

console.log(
  'GitHub gate contract verified: PR Merge Gate, post-deploy Production Gate, and main-protection drift audit are wired.'
);

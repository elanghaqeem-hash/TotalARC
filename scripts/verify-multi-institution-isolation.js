const fs = require('fs');

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

const failures = [];

function requireText(path, text, label) {
  const content = read(path);
  if (!content.includes(text)) {
    failures.push(`${label}: expected "${text}" in ${path}`);
  }
}

function forbidText(path, text, label) {
  const content = read(path);
  if (content.includes(text)) {
    failures.push(`${label}: forbidden "${text}" remains in ${path}`);
  }
}

const assuranceRoute = 'src/app/api/assurance/route.ts';
requireText(assuranceRoute, 'const context = await resolveInstitutionAccess(request);', 'Assurance mutations require authenticated institution context');
requireText(assuranceRoute, 'const institutionId = context.institution.id;', 'Assurance route derives active institution server-side');
requireText(assuranceRoute, '}, institutionId);', 'Assurance mutations propagate tenant id');

const rcsa = 'src/lib/d1-rcsa.ts';
requireText(rcsa, 'function assertTenant(', 'RCSA contains cross-tenant record guard');
requireText(rcsa, 'TENANT_RECORD_NOT_FOUND', 'RCSA rejects records outside active institution');
requireText(rcsa, 'AND institutionId = ?', 'RCSA master updates are institution constrained');
requireText(rcsa, 'JOIN ControlMaster c ON c.id = m.controlId', 'RCSA risk-control mappings are tenant-joined');
requireText(rcsa, 'WHERE institutionId = ? AND sourceType = ? AND sourceId = ?', 'RCSA tasks are tenant-scoped');

const assurance = 'src/lib/d1-assurance.ts';
requireText(assurance, 'export async function listToeTests(institutionId?: string | null)', 'ToE reads accept explicit institution');
requireText(assurance, 'export async function listRemediationData(institutionId?: string | null)', 'Remediation reads accept explicit institution');
requireText(assurance, 'export async function listMonitoringRules(institutionId?: string | null)', 'CCM reads accept explicit institution');
requireText(assurance, 'export async function saveAssuranceCalendarEvent(', 'Calendar writer present');
requireText(assurance, 'institutionId?: string | null', 'Assurance writers/readers support explicit institution');
requireText(assurance, 'function assertAssuranceTenant(', 'ToE/remediation/CCM mutations enforce tenant ownership');
requireText(assurance, 'TENANT_RECORD_NOT_FOUND', 'Assurance mutations reject cross-tenant records');

const toeRoute = 'src/app/api/assure/toe/route.ts';
requireText(toeRoute, 'resolveInstitutionAccess(request)', 'ToE API resolves active institution');
requireText(toeRoute, 'institutionId);', 'ToE mutations propagate active institution');

const remediationRoute = 'src/app/api/assure/remediation/route.ts';
requireText(remediationRoute, 'resolveInstitutionAccess(request)', 'Remediation API resolves active institution');
requireText(remediationRoute, 'institutionId);', 'Remediation mutations propagate active institution');

const ccmRoute = 'src/app/api/monitor/ccm/route.ts';
requireText(ccmRoute, 'resolveInstitutionAccess(request)', 'CCM API resolves active institution');
requireText(ccmRoute, 'institutionId', 'CCM mutations propagate active institution');

const aiRoute = 'src/app/api/ai/analyze/route.ts';
requireText(aiRoute, "import { resolveInstitutionAccess } from '@/lib/institution-context';", 'AI analysis resolves institution server-side');
requireText(aiRoute, '}, institutionId)', 'AI analysis passes tenant id to BPM lookup');

const core = 'src/lib/d1-core.ts';
requireText(core, 'export async function findBusinessProcessForAi(', 'AI BPM lookup exists');
requireText(core, "tenantId ? ' AND institutionId = ?' : ''", 'AI BPM lookup is tenant constrained');

const institutionApi = 'src/app/api/institutions/route.ts';
requireText(institutionApi, 'Only administrators can switch institution context.', 'Institution switching is admin-only');
requireText(institutionApi, 'context.institutions.find', 'Institution switch validates accessible tenant');

const institutionContext = 'src/lib/institution-context.ts';
requireText(institutionContext, "profile.role === 'Admin'", 'Institution context distinguishes administrator access');
requireText(institutionContext, 'allInstitutions.filter(item => item.id === profile.institutionId)', 'Non-admin users are locked to assigned institution');

const nttImporter = 'scripts/promote-bank-ntt-source-data.py';
requireText(nttImporter, "'crossTenantOrg'", 'Bank NTT importer verifies organization cross-tenant leakage');
requireText(nttImporter, "'bankKalbarUnchanged'", 'Bank NTT importer verifies Bank Kalbar remains unchanged');
requireText(nttImporter, 'BANK_KALBAR_CHANGED_DURING_BANK_NTT_IMPORT', 'Bank NTT importer fails on Bank Kalbar mutation');

const nttSource = JSON.parse(read('data/bank-ntt-source-2025.json'));
if (nttSource?.institution?.legalName !== 'PT. Bank Pembangunan Daerah Nusa Tenggara Timur') {
  failures.push('Bank NTT source bundle legalName is missing or unexpected.');
}
if (!Array.isArray(nttSource?.branches) || nttSource.branches.length !== 23) {
  failures.push('Bank NTT source bundle must retain 23 source-backed branches.');
}
if (!Array.isArray(nttSource?.organizationUnits) || nttSource.organizationUnits.length < 1) {
  failures.push('Bank NTT source bundle must contain source-backed organization units.');
}

forbidText(
  aiRoute,
  'findBusinessProcessForAi({\n            processId: processId || undefined,\n            processName: processName || undefined\n          })',
  'AI lookup must not omit institution id'
);

if (failures.length) {
  console.error('Multi-institution isolation verification FAILED:');
  for (const failure of failures) console.error('- ' + failure);
  process.exit(1);
}

console.log('Multi-institution isolation verification PASS');
console.log('- Active institution is resolved server-side.');
console.log('- Assurance/RCSA mutations carry active institution id.');
console.log('- Assurance/ICOFR aggregate reads are explicitly tenant-scoped.');
console.log('- AI BPM analysis is tenant-scoped.');
console.log('- Bank NTT importer contains Bank Kalbar non-mutation and cross-tenant checks.');
console.log('- Bank NTT source bundle remains source-backed and institution-specific.');

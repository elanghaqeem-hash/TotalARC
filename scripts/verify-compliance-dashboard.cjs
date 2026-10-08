/* eslint-disable no-console */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const read = file => fs.readFileSync(path.join(process.cwd(), file), 'utf8');
const lib = read('src/lib/d1-compliance-dashboard.ts');
const api = read('src/app/api/compliance/dashboard/route.ts');
const ui = read('src/app/compliance/page.tsx');
const shell = read('src/components/layout/AppShell.tsx');
const access = read('src/lib/access-control.ts');

// Verify the authorization and tenant context are not client-supplied.
assert.match(api, /resolveInstitutionAccess\(request\)/);
assert.match(api, /READ_ROLES\.has\(context\.profile\.role\)/);
assert.match(api, /getComplianceDashboard\(context\.institution\.id\)/);
assert.doesNotMatch(api, /searchParams\.get\(['"]institutionId['"]\)/);
assert.match(api, /Cache-Control.*private, no-store/);
assert.doesNotMatch(api, /export async function POST/);
assert.match(access, /\{ api: '\/api\/compliance\/dashboard', page: '\/compliance' \}/);
assert.match(access, /ComplianceOfficer:[\s\S]*?\{ path: '\/compliance' \}/);
assert.match(access, /Executive:[\s\S]*?\{ path: '\/compliance' \}/);
assert.doesNotMatch(access.match(/ProcessOwner: \[[\s\S]*?\],/)[0], /\/compliance/);
assert.match(shell, /href: '\/compliance'/);
assert.match(ui, /fetch\('\/api\/compliance\/dashboard'/);
assert.match(ui, /complianceRate === null/);
assert.match(ui, /Belum ada kewajiban berstatus aktif/);
assert.match(ui, /AbortController/);

// Check actual aggregate logic with an in-memory D1 adapter, without live banking data.
const compile = ts.transpileModule(lib, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText;

const calls = [];
let nextTenant = '';
let index = 0;
const db = {
  prepare(sql) {
    const position = index++;
    assert.match(sql, /institutionId/, 'every query must scope to institution');
    assert.ok(!/SELECT\s+\*/i.test(sql), 'no unbounded SELECT * is permitted');
    assert.ok(position < 5, 'unexpected query issued by dashboard');
    return {
      bind(...args) {
        assert.ok(args.includes(nextTenant), 'query must bind the active tenant');
        calls.push({ sql, args, position });
        const filled = nextTenant === 'bank-A';
        const summary = filled ? {
          total: 3, active: 2, draft: 1, compliant: 1, partial: 1,
          nonCompliant: 0, notAssessed: 0, notApplicable: 0, linked: 1,
          ownerMissing: 0, overdueAssessment: 1, dueSoon: 1,
          highRiskGaps: 1, reporting: 1, lastUpdated: '2026-10-08T00:00:00Z'
        } : {
          total: 0, active: 0, draft: 0, compliant: 0, partial: 0,
          nonCompliant: 0, notAssessed: 0, notApplicable: 0,
          linked: 0, ownerMissing: 0, overdueAssessment: 0,
          dueSoon: 0, highRiskGaps: 0, reporting: 0, lastUpdated: null
        };
        const catalog = filled ? {
          policies: 7, regulations: 2, openPolicyActions: 1, highImpactPolicyActions: 1
        } : { policies: 0, regulations: 0, openPolicyActions: 0, highImpactPolicyActions: 0 };
        return {
          async first() {
            if (position === 0) return summary;
            if (position === 1) return catalog;
            if (position === 2) return filled ? { openActions: 1, overdueActions: 1 }
              : { openActions: 0, overdueActions: 0 };
            throw new Error('unexpected first query index ' + position);
          },
          async all() {
            if (position === 3) return {
              results: filled ? [{
                id: 'a1', obligationCode: 'OBL-A1', requirementText: 'Sample only in unit test',
                criticality: 'Tinggi', complianceStatus: 'PARTIAL', ownerName: 'Unit A',
                dueDate: null, nextAssessmentDate: null, regulationCode: 'REG-1', regulator: 'TEST'
              }] : []
            };
            if (position === 4) return {
              results: filled ? [{ owner: 'Unit A', total: 2, gaps: 1, unassessed: 0 }] : []
            };
            throw new Error('unexpected all query index ' + position);
          }
        };
      }
    };
  }
};

const moduleExports = {};
vm.runInNewContext(compile, {
  exports: moduleExports,
  require: moduleName => {
    assert.equal(moduleName, '@/lib/d1-regulatory-obligations');
    return { ensureRegulatoryObligationSchema: async () => db };
  },
  Intl, Date, Math, Number, String, console
}, { timeout: 3000, filename: 'd1-compliance-dashboard.test.js' });

(async () => {
  nextTenant = 'bank-A'; index = 0; calls.length = 0;
  const a = await moduleExports.getComplianceDashboard('bank-A');
  assert.equal(a.metrics.activeObligations, 2);
  assert.equal(a.metrics.draftObligations, 1);
  assert.equal(a.metrics.complianceRate, 50);
  assert.equal(a.metrics.mappingRate, 50);
  assert.equal(a.metrics.highRiskGaps, 1);
  assert.equal(a.metrics.overdueAssessmentActions, 1);
  assert.equal(a.priorities[0].obligationCode, 'OBL-A1');
  assert.equal(calls.length, 5);
  assert.equal(calls.filter(c => c.args.includes('bank-B')).length, 0);

  nextTenant = 'bank-B'; index = 0; calls.length = 0;
  const b = await moduleExports.getComplianceDashboard('bank-B');
  assert.equal(b.metrics.activeObligations, 0);
  assert.equal(b.metrics.complianceRate, null, 'no scope must never imply 100% or 0% compliance');
  assert.equal(b.metrics.mappingRate, null);
  assert.deepEqual(JSON.parse(JSON.stringify(b.priorities)), []);
  assert.equal(calls.length, 5);
  assert.equal(calls.filter(c => c.args.includes('bank-A')).length, 0);
  console.log('Compliance Dashboard PASS: RBAC, tenant query binding, bounded D1 aggregates, accurate denominators and zero-scope handling.');
})().catch(error => { console.error(error); process.exitCode = 1; });

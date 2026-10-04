const fs = require('fs');

function read(path) {
  if (!fs.existsSync(path)) throw new Error('ICOFR_TRACEABILITY_ERROR: missing ' + path);
  return fs.readFileSync(path, 'utf8');
}

function requireMarker(path, marker) {
  if (!read(path).includes(marker)) {
    throw new Error('ICOFR_TRACEABILITY_ERROR: ' + path + ' missing marker: ' + marker);
  }
}

const integrity = 'src/lib/d1-icofr-integrity.ts';
for (const marker of [
  'ASSERTION_FINANCIAL_ITEM_ORPHAN',
  'CONTROL_RISK_MAPPING_CROSS_TENANT',
  'TOD_CONTROL_ORPHAN',
  'TOE_CROSS_TENANT',
  'TEST_EXCEPTION_ORPHAN',
  'DEFICIENCY_EXCEPTION_ORPHAN',
  'ISSUE_PROCESS_ORPHAN',
  'ISSUE_RISK_ORPHAN',
  'ISSUE_CONTROL_ORPHAN',
  'MAP_ISSUE_ORPHAN',
  "test: 'ICOFR_END_TO_END_REFERENTIAL_INTEGRITY'",
  "completenessTest: 'ICOFR_TRACEABILITY_COMPLETENESS'",
  'significantFinancialItems',
  'significantFinancialItemsWithAssertion',
  'inScopeAssertions',
  'assertionsWithProcess',
  'assertionsWithRisk',
  'assertionsWithControl',
  'controlsWithToD',
  'controlsWithToE',
  'exceptionsWithDeficiency',
  'deficienciesWithIssue',
  'issuesWithMAP',
  'completeChains',
  'incompleteChains',
  'coveragePercent',
  'mandatoryChainGapCount',
  'IN_SCOPE_ASSERTION_RISK_MISSING',
  'ASSERTION_RISK_CONTROL_MISSING',
  'KEY_CONTROL_TOD_MISSING',
  'KEY_CONTROL_TOE_MISSING',
  'EXCEPTION_DEFICIENCY_MISSING',
  'APPROVED_DEFICIENCY_ISSUE_MISSING',
  'ISSUE_MAP_MISSING',
  'orphanCount',
  'crossTenantCount'
]) requireMarker(integrity, marker);

requireMarker('src/app/api/system/icofr-integrity/route.ts', 'getIcofrReferentialIntegrityReport');
requireMarker('.github/workflows/verify-production-d1.yml', '/api/system/icofr-integrity');
requireMarker('.github/workflows/verify-production-d1.yml', '.orphanCount == 0');
requireMarker('.github/workflows/verify-production-d1.yml', '.crossTenantCount == 0');
requireMarker('.github/workflows/verify-production-d1.yml', '.mandatoryChainGapCount == 0');
requireMarker('.github/workflows/verify-production-d1.yml', '.metrics.significantFinancialItems');
requireMarker('.github/workflows/verify-production-d1.yml', '.metrics.significantFinancialItemsWithAssertion');
requireMarker('.github/workflows/verify-production-d1.yml', '.metrics.inScopeAssertions');
requireMarker('.github/workflows/verify-production-d1.yml', '.metrics.assertionsWithProcess');
requireMarker('.github/workflows/verify-production-d1.yml', '.metrics.coveragePercent');
requireMarker('.github/workflows/verify-production-d1.yml', '.completenessChecks[]');

console.log('ICOFR traceability contract verified: referential integrity and mandatory-chain completeness production gates are wired.');

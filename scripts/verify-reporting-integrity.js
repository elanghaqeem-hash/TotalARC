const fs = require('fs');

const findings = [];

function read(path) {
  if (!fs.existsSync(path)) {
    findings.push(`${path}: missing file`);
    return '';
  }
  return fs.readFileSync(path, 'utf8');
}

function requirePatterns(path, content, patterns) {
  for (const pattern of patterns) {
    if (!pattern.test(content)) {
      findings.push(`${path}: missing reporting integrity contract ${pattern}`);
    }
  }
}

const templatesPath = 'src/lib/regulatory-report-templates.ts';
const templates = read(templatesPath);
requirePatterns(templatesPath, templates, [
  /POJK Nomor 17 Tahun 2023/,
  /SEOJK Nomor 14\/SEOJK\.03\/2025/,
  /POJK Nomor 18 Tahun 2025/,
  /SEOJK Nomor 29\/SEOJK\.03\/2025/,
  /SEOJK Nomor 32\/SEOJK\.03\/2025/,
  /officialAnnexRequired:\s*true/,
  /verifiedAsOf:\s*'2026-09-20'/,
  /16 faktor|governanceFactors/i
]);

const domainPath = 'src/lib/d1-reporting.ts';
const domain = read(domainPath);
requirePatterns(domainPath, domain, [
  /CREATE TABLE IF NOT EXISTS RegulatoryReport/,
  /CREATE TABLE IF NOT EXISTS RegulatoryReportSection/,
  /CREATE TABLE IF NOT EXISTS RegulatoryReportSourceSnapshot/,
  /export async function listRegulatoryReports/,
  /export async function getReportingSourceCounts/,
  /export async function getRegulatoryReportEvidence/,
  /export async function createRegulatoryReport/,
  /export async function updateRegulatoryReport/,
  /export async function updateRegulatoryReportSection/,
  /export async function applyAiRegulatoryDraft/,
  /AI Draft — Human Review Required/,
  /recordMutationAudit/
]);

const routePath = 'src/app/api/reports/route.ts';
const route = read(routePath);
requirePatterns(routePath, route, [
  /authorizeTenantApi/,
  /resolveAuthorizedOrgUnitIds/,
  /REPORT_ORGANIZATION_SCOPE_FORBIDDEN/,
  /CREATE_REPORT/,
  /UPDATE_REPORT/,
  /UPDATE_SECTION/,
  /guardMutationRequest/,
  /mutationActorFromRequest/
]);

const aiRoutePath = 'src/app/api/reports/ai/route.ts';
const aiRoute = read(aiRoutePath);
requirePatterns(aiRoutePath, aiRoute, [
  /authorizeTenantApi/,
  /guardAiPost/,
  /guardMutationRequest/,
  /resolveAuthorizedOrgUnitIds/,
  /getRegulatoryReportEvidence/,
  /report_drafting/,
  /Do not invent financial figures/,
  /Human Review Required/,
  /applyAiRegulatoryDraft/
]);

const exportPath = 'src/app/api/reports/export/route.ts';
const exportRoute = read(exportPath);
requirePatterns(exportPath, exportRoute, [
  /authorizeTenantApi/,
  /resolveAuthorizedOrgUnitIds/,
  /application\/msword/,
  /Preview|print|@page/i,
  /Official OJK annex\/Excel is required/,
  /Human Review Required/
]);

const pagePath = 'src/app/reports/page.tsx';
const page = read(pagePath);
requirePatterns(pagePath, page, [
  /Report & OJK Analysis Center/,
  /Generate AI Analysis/,
  /Executive Summary/,
  /Overall Conclusion/,
  /Temuan Utama/,
  /Root Cause/,
  /Analisis Dampak/,
  /Rekomendasi/,
  /Tanggapan Manajemen/,
  /Action Plan/,
  /Evidence Reference/,
  /Official OJK Excel\/annex/,
  /Preview \/ Print PDF/,
  /aiJsonTransaction/,
  /jsonTransaction/,
  /jsonRead/
]);

const aiTypesPath = 'src/lib/ai/types.ts';
const aiTypes = read(aiTypesPath);
requirePatterns(aiTypesPath, aiTypes, [
  /'regulatory_analysis'/,
  /'report_drafting'/
]);

const prismaPath = 'prisma/schema.prisma';
const prisma = read(prismaPath);
requirePatterns(prismaPath, prisma, [
  /model RegulatoryReport\s*{/,
  /model RegulatoryReportSection\s*{/,
  /model RegulatoryReportSourceSnapshot\s*{/
]);

if (findings.length) {
  console.error('Regulatory reporting integrity violations detected:');
  for (const finding of findings) console.error(' - ' + finding);
  process.exit(1);
}

console.log('Regulatory reporting integrity guardrails passed.');

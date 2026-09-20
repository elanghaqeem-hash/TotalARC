const fs = require('fs');

const findings = [];

function requireFile(path) {
  if (!fs.existsSync(path)) {
    findings.push(`${path}: missing file`);
    return '';
  }
  return fs.readFileSync(path, 'utf8');
}

function requirePatterns(path, content, patterns) {
  for (const pattern of patterns) {
    if (!pattern.test(content)) {
      findings.push(`${path}: missing assurance persistence contract ${pattern}`);
    }
  }
}

const domainPath = 'src/lib/d1-assurance.ts';
const rcsaRoutePath = 'src/app/api/assure/rcsa/route.ts';
const todRoutePath = 'src/app/api/assure/tod/route.ts';
const icofrRoutePath = 'src/app/api/assure/icofr/route.ts';
const certificationRoutePath = 'src/app/api/assure/certification/route.ts';
const tasksRoutePath = 'src/app/api/assure/tasks/route.ts';
const toeRoutePath = 'src/app/api/assure/toe/route.ts';
const toePagePath = 'src/app/toe/page.tsx';
const registerPaginationPath = 'src/lib/d1-register-pagination.ts';
const aggregateRoutePath = 'src/app/api/assurance/route.ts';
const rcsaPagePath = 'src/app/rcsa/page.tsx';
const todPagePath = 'src/app/tod/page.tsx';
const icofrPagePath = 'src/app/icofr/page.tsx';
const certificationPagePath = 'src/app/certification/page.tsx';
const tasksPagePath = 'src/app/tasks/page.tsx';
const prismaPath = 'prisma/schema.prisma';

const domain = requireFile(domainPath);
requirePatterns(domainPath, domain, [
  /CREATE TABLE IF NOT EXISTS AssessmentCampaign/,
  /CREATE TABLE IF NOT EXISTS CSAResponse/,
  /CREATE TABLE IF NOT EXISTS FinancialAccount/,
  /CREATE TABLE IF NOT EXISTS AccountAssertionMapping/,
  /CREATE TABLE IF NOT EXISTS IPERegister/,
  /CREATE TABLE IF NOT EXISTS Walkthrough/,
  /CREATE TABLE IF NOT EXISTS ToDTest/,
  /CREATE TABLE IF NOT EXISTS ToETest/,
  /CREATE TABLE IF NOT EXISTS TestSample/,
  /CREATE TABLE IF NOT EXISTS TestingException/,
  /idx_sample_toe_result/,
  /idx_exception_toe_sample_ref/,
  /CREATE TABLE IF NOT EXISTS ControlCertification/,
  /CREATE TABLE IF NOT EXISTS ManagementAttestation/,
  /CREATE TABLE IF NOT EXISTS Task/,
  /export async function listRcsaData/,
  /export async function createAssessmentCampaign/,
  /export async function upsertCsaResponse/,
  /export async function listTodData/,
  /export async function createTodTest/,
  /export async function createWalkthrough/,
  /export async function listIcofrData/,
  /export async function createFinancialAccount/,
  /export async function upsertAccountAssertion/,
  /export async function createIpeRegister/,
  /export async function listCertificationData/,
  /export async function createControlCertification/,
  /export async function createManagementAttestation/,
  /export async function listTasksData/,
  /export async function createTask/,
  /export async function updateTaskStatus/
]);

const rcsaRoute = requireFile(rcsaRoutePath);
requirePatterns(rcsaRoutePath, rcsaRoute, [
  /authorizeTenantApi/,
  /resolveAuthorizedOrgUnitIds/,
  /RCSA_ORGANIZATION_SCOPE_FORBIDDEN/,
  /CREATE_CAMPAIGN/,
  /UPSERT_RESPONSE/,
  /recordMutationAudit/
]);

const todRoute = requireFile(todRoutePath);
requirePatterns(todRoutePath, todRoute, [
  /authorizeTenantApi/,
  /resolveAuthorizedOrgUnitIds/,
  /TOD_ORGANIZATION_SCOPE_FORBIDDEN/,
  /CREATE_TEST/,
  /CREATE_WALKTHROUGH/,
  /recordMutationAudit/
]);

const icofrRoute = requireFile(icofrRoutePath);
requirePatterns(icofrRoutePath, icofrRoute, [
  /authorizeTenantApi/,
  /resolveAuthorizedOrgUnitIds/,
  /ICOFR_ORGANIZATION_SCOPE_FORBIDDEN/,
  /CREATE_ACCOUNT/,
  /CREATE_IPE/,
  /UPSERT_ASSERTION/,
  /recordMutationAudit/
]);

const certificationRoute = requireFile(certificationRoutePath);
requirePatterns(certificationRoutePath, certificationRoute, [
  /authorizeTenantApi/,
  /resolveAuthorizedOrgUnitIds/,
  /CERTIFICATION_ORGANIZATION_SCOPE_FORBIDDEN/,
  /CREATE_CERTIFICATION/,
  /CREATE_ATTESTATION/,
  /recordMutationAudit/
]);

const tasksRoute = requireFile(tasksRoutePath);
requirePatterns(tasksRoutePath, tasksRoute, [
  /authorizeTenantApi/,
  /resolveAuthorizedOrgUnitIds/,
  /TASK_ORGANIZATION_SCOPE_FORBIDDEN/,
  /CREATE_TASK/,
  /UPDATE_STATUS/,
  /recordMutationAudit/
]);

const toeRoute = requireFile(toeRoutePath);
requirePatterns(toeRoutePath, toeRoute, [
  /authorizeTenantApi/,
  /mode === 'detail'/,
  /parsePaginationRequest\(request, 'sample'\)/,
  /getToeTestDetailPage/,
  /getToeTestScopeById/,
  /TOE_ORGANIZATION_SCOPE_FORBIDDEN/,
  /ADD_SAMPLE/,
  /UPDATE_SAMPLE/,
  /CREATE_EXCEPTION/
]);

const registerPagination = requireFile(registerPaginationPath);
requirePatterns(registerPaginationPath, registerPagination, [
  /export async function listToeRegisterPage/,
  /export async function getToeTestDetailPage/,
  /samplePagination/,
  /TestSample/,
  /TestingException/
]);

const toePage = requireFile(toePagePath);
requirePatterns(toePagePath, toePage, [
  /loadDetail/,
  /samplePageSize:\s*'50'/,
  /samplePagination/,
  /Raise Exception/,
  /saveSampleResult/
]);

const aggregateRoute = requireFile(aggregateRoutePath);
requirePatterns(aggregateRoutePath, aggregateRoute, [
  /listRcsaData/,
  /listTodData/,
  /listIcofrData/,
  /listCertificationData/,
  /listTasksData/,
  /campaigns,/,
  /todTests:\s*scopedTodTests/,
  /financialAccounts:\s*scopedFinancialAccounts/,
  /ipeRegisters:\s*scopedIpe/,
  /certifications:\s*scopedCertifications/,
  /attestations:\s*scopedAttestations/,
  /tasks:\s*scopedTasks/,
  /controls:\s*scopedControls/
]);

const rcsaPage = requireFile(rcsaPagePath);
requirePatterns(rcsaPagePath, rcsaPage, [
  /\/api\/assure\/rcsa/,
  /Create Campaign/,
  /CSA Response/
]);

const todPage = requireFile(todPagePath);
requirePatterns(todPagePath, todPage, [
  /\/api\/assure\/tod/,
  /Create Test of Design/,
  /Record Walkthrough/
]);

const icofrPage = requireFile(icofrPagePath);
requirePatterns(icofrPagePath, icofrPage, [
  /\/api\/assure\/icofr/,
  /Register Financial Account/,
  /Register IPE/
]);

const certificationPage = requireFile(certificationPagePath);
requirePatterns(certificationPagePath, certificationPage, [
  /\/api\/assure\/certification/,
  /Create Control Certification/,
  /Create Management Attestation/
]);

const tasksPage = requireFile(tasksPagePath);
requirePatterns(tasksPagePath, tasksPage, [
  /\/api\/assure\/tasks/,
  /Create Assurance Task/,
  /UPDATE_STATUS/
]);

const prisma = requireFile(prismaPath);
requirePatterns(prismaPath, prisma, [
  /model AssessmentCampaign[\s\S]*orgUnitId\s+String\?/,
  /model FinancialAccount[\s\S]*institutionId\s+String[\s\S]*orgUnitId\s+String\?/,
  /model IPERegister[\s\S]*institutionId\s+String[\s\S]*orgUnitId\s+String\?/,
  /model ToDTest/,
  /model ManagementAttestation[\s\S]*institutionId\s+String[\s\S]*orgUnitId\s+String\?/,
  /model Task[\s\S]*institutionId\s+String[\s\S]*orgUnitId\s+String\?/
]);

if (findings.length) {
  console.error('Assurance persistence guardrail violations detected:');
  for (const finding of findings) console.error(' - ' + finding);
  process.exit(1);
}

console.log('Assurance persistence guardrails passed.');
